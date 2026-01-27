/**
 * Vue 2 SFC Compiler
 * Full-featured Vue 2 SFC compiler with JSX, TypeScript, and style preprocessor support
 *
 * @module vue2-sfc-compiler
 */

import { parseSFC, generateScopeId } from './parser'
import { compileScriptBlock, COMP_IDENTIFIER } from './compiler/script'
import { attachTemplateString } from './compiler/template'
import { compileStyleBlocks } from './compiler/style'
import { toUMD } from './transform/umd'
import { createVue2JsxPreset } from 'vue2-jsx-browser'
import type { CompilerOptions, CompileResult, Compiler, UMDOptions, UMDResult, CommonJSResult } from './types'

// Re-export types
export type {
  CompilerOptions,
  CompileResult,
  CommonJSResult,
  UMDOptions,
  UMDResult,
  Compiler,
  BabelTransformFn,
  StylePreprocessors,
  StylePreprocessorFn,
  SFCDescriptor,
} from './types'

// Re-export vue2-jsx-browser
export {
  createVue2JsxPreset,
  babelPluginTransformVueJsx,
  babelSugarFunctionalVue,
  babelSugarVModel,
  babelSugarVOn,
} from 'vue2-jsx-browser'
export type { Vue2JsxPresetOptions, Vue2JsxPreset } from 'vue2-jsx-browser'

// Re-export utilities
export { parseSFC, generateScopeId } from './parser'
export { toUMD } from './transform/umd'
export { COMP_IDENTIFIER } from './compiler/script'
export { compileTemplateBlock, attachTemplateString } from './compiler/template'
export { compileStyleBlocks, generateStyleInjection } from './compiler/style'

/** Default Vue 2 JSX preset instance */
const defaultJsxPreset = createVue2JsxPreset(null)

/**
 * Clean CommonJS module code, removing module system statements
 * Based on repl-vue2's umd-transformer implementation
 */
function cleanCommonJSCode(js: string): string {
  let result = js

  // Remove "use strict"
  result = result.replace(/"use strict";?\s*/g, '')

  // Remove Object.defineProperty(exports, "__esModule", ...)
  result = result.replace(
    /Object\.defineProperty\s*\(\s*exports\s*,\s*["']__esModule["']\s*,\s*\{[^}]*\}\s*\)\s*;?/g,
    ''
  )

  // Remove chained default export: var _default = exports.default = __sfc__;
  // This must come BEFORE the simple exports.default removal to avoid partial matches
  result = result.replace(/var\s+_default\s*=\s*exports\s*(\["default"\]|\.default)\s*=\s*[^;\n]+;?\n?/g, '')

  // Remove exports["default"] = ... or exports.default = ... (single line only)
  // Only match at line start to avoid matching inside other statements
  result = result.replace(/^[ \t]*exports\s*(\["default"\]|\.default)\s*=\s*[^;\n]+;?\n?/gm, '')

  // Remove module.exports = ... (single line only)
  result = result.replace(/module\.exports\s*=\s*[^;\n]+;?\n?/g, '')

  // Replace require("vue") with empty string (we'll replace _vue references directly)
  result = result.replace(/var\s+_vue\s*=\s*require\s*\(\s*["']vue["']\s*\)\s*;?\n?/g, '')
  result = result.replace(/require\s*\(\s*["']vue["']\s*\)/g, 'Vue')

  // Replace _vue["default"] or _vue.default with Vue
  result = result.replace(/_vue\s*\[\s*["']default["']\s*\]/g, 'Vue')
  result = result.replace(/_vue\.default/g, 'Vue')

  // Replace _vue.xxx (named exports like defineComponent, ref, etc.) with Vue.xxx
  // Vue 2.7 exposes Composition API as Vue.ref, Vue.defineComponent, etc.
  // Pattern: (0, _vue.methodName) or _vue.methodName
  result = result.replace(/\(0,\s*_vue\.(\w+)\)/g, 'Vue.$1')
  result = result.replace(/_vue\.(\w+)/g, 'Vue.$1')

  // Replace standalone _vue with Vue (for cases like var x = _vue)
  result = result.replace(/\b_vue\b/g, 'Vue')

  // Replace require("element-ui") with global ELEMENT
  result = result.replace(/var\s+_elementUi\s*=\s*require\s*\(\s*["']element-ui["']\s*\)\s*;?/g, 'var _elementUi = ELEMENT;')
  result = result.replace(/require\s*\(\s*["']element-ui["']\s*\)/g, 'ELEMENT')
  result = result.replace(/_elementUi\s*\[\s*["']default["']\s*\]/g, 'ELEMENT')
  result = result.replace(/_elementUi\.default/g, 'ELEMENT')

  // Replace local component require
  result = result.replace(
    /var\s+(_\w+)\s*=\s*_interopRequireDefault\s*\(\s*require\s*\(\s*["']\.\/(\w+)\.vue["']\s*\)\s*\)\s*;?/g,
    'var $1 = { "default": window.$2 || {} };'
  )

  // Remove var _default = __sfc__; or similar statements (single line only)
  result = result.replace(/var\s+_default\s*=\s*[^;\n]*;?\n?/g, '')

  // Remove exports.default = _default or similar statements (single line only)
  result = result.replace(/exports\.default\s*=\s*_default\s*;?\n?/g, '')

  // Remove _interopRequireDefault function definition (if present)
  result = result.replace(/function\s+_interopRequireDefault\s*\([^)]*\)\s*\{[^}]*\}\s*/g, '')

  // Clean up multiple empty lines
  result = result.replace(/\n{3,}/g, '\n\n')

  return result.trim()
}

/**
 * Generate UMD wrapper code
 * Based on repl-vue2's umd-transformer implementation
 */
function generateUMDWrapper(
  componentName: string,
  componentCode: string,
  css: string,
  componentIdentifier: string = COMP_IDENTIFIER
): string {
  const styleInjection = css
    ? `
  // Inject styles
  var __css__ = ${JSON.stringify(css)};
  if (typeof document !== 'undefined') {
    var existingStyle = document.querySelector('style[data-v-component="${componentName}"]');
    if (existingStyle) {
      existingStyle.textContent = __css__;
    } else {
      var style = document.createElement('style');
      style.setAttribute('data-v-component', '${componentName}');
      style.textContent = __css__;
      document.head.appendChild(style);
    }
  }
`
    : ''

  return `(function(root, factory) {
  if (typeof define === 'function' && define.amd) {
    // AMD (require.js)
    define([], factory);
  } else if (typeof module === 'object' && module.exports) {
    // CommonJS
    module.exports = factory();
  } else {
    // Browser global
    root['${componentName}'] = factory();
  }
})(typeof self !== 'undefined' ? self : this, function() {
  'use strict';
${styleInjection}
  // Component definition
  ${componentCode}

  // Register as global Vue component if Vue is available
  if (typeof Vue !== 'undefined' && Vue.component) {
    Vue.component('${componentName}', ${componentIdentifier});
  }

  return ${componentIdentifier};
});
`
}

/**
 * Create a compiler instance with the provided options
 *
 * @example
 * ```typescript
 * // Node.js usage
 * import { createCompiler } from 'vue2-sfc-compiler'
 * import { transformSync } from '@babel/core'
 *
 * const compiler = createCompiler({
 *   babelTransform: (code, options) => transformSync(code, options)?.code || '',
 * })
 *
 * const result = compiler.compileSFC(sfcCode, 'MyComponent')
 * console.log(result.js, result.css)
 *
 * // Or use high-level API for UMD output
 * const umdCode = await compiler.compileToUMD(sfcCode, 'MyComponent')
 * ```
 *
 * @example
 * ```typescript
 * // Browser usage with @babel/standalone
 * import { createCompiler } from 'vue2-sfc-compiler'
 *
 * const compiler = createCompiler({
 *   babelTransform: async (code, options) => {
 *     const result = Babel.transform(code, options)
 *     return result.code
 *   },
 *   stylePreprocessors: {
 *     less: async (code) => {
 *       const result = await less.render(code)
 *       return result.css
 *     },
 *   },
 * })
 *
 * const umdCode = await compiler.compileToUMD(sfcCode, 'MyComponent')
 * ```
 */
export function createCompiler(options: CompilerOptions): Compiler {
  const { babelTransform, stylePreprocessors, vue2JsxPreset = defaultJsxPreset } = options

  /**
   * Compile a Vue 2 SFC file
   * @param code - SFC source code
   * @param name - Component name (e.g., 'MyButton'), used for:
   *   - Component name in Vue devtools
   *   - Scoped CSS unique ID generation
   *   - UMD global variable name
   */
  async function compileSFC(
    code: string,
    name: string
  ): Promise<CompileResult> {
    const errors: string[] = []

    // Normalize name: remove .vue suffix if present
    const componentName = name.replace(/\.vue$/, '')
    // Internal filename for parser and scopeId
    const filename = `${componentName}.vue`

    try {
      // Step 1: Parse SFC
      const descriptor = parseSFC(code, filename)

      // Step 2: Generate scope ID for scoped styles
      const hasScoped = descriptor.styles.some((s) => s.scoped)
      const scopeId = hasScoped ? generateScopeId(filename, code) : undefined

      // Helper to extract error message
      const getErrorMessage = (err: unknown): string => {
        if (err instanceof Error) return err.message
        return String(err)
      }

      // Helper to escape string for JS
      const escapeJS = (str: string): string => {
        return str.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n')
      }

      // Step 3: Compile script
      let jsCode = ''
      let scriptError = false
      try {
        jsCode = await compileScriptBlock(descriptor, {
          babelTransform,
          vue2JsxPreset,
          scopeId,
          source: code, // Pass original source for script setup compilation
        })
      } catch (error) {
        scriptError = true
        errors.push(`Script compilation error: ${getErrorMessage(error)}`)
        jsCode = `var ${COMP_IDENTIFIER} = { name: '${escapeJS(componentName)}' };\nexport default ${COMP_IDENTIFIER};`
      }

      // Step 4: Compile template (skip if script failed)
      if (!scriptError) {
        try {
          // For browser runtime, attach template as string
          // Vue 2 will compile it at runtime
          const templateCode = attachTemplateString(descriptor)
          if (templateCode) {
            jsCode += '\n' + templateCode
          }
        } catch (error) {
          errors.push(`Template compilation error: ${getErrorMessage(error)}`)
        }
      }

      // Step 5: Compile styles
      let cssCode = ''
      try {
        cssCode = await compileStyleBlocks(descriptor, {
          scopeId,
          preprocessors: stylePreprocessors,
        })
      } catch (error) {
        errors.push(`Style compilation error: ${getErrorMessage(error)}`)
      }

      // Step 6: Ensure component has a name
      // If no name defined in SFC, add inferred name from filename
      if (!jsCode.includes(`${COMP_IDENTIFIER}.name`) && !jsCode.includes(`name:`)) {
        jsCode = jsCode.replace(
          `export default ${COMP_IDENTIFIER}`,
          `${COMP_IDENTIFIER}.name = ${COMP_IDENTIFIER}.name || "${componentName}";\nexport default ${COMP_IDENTIFIER}`
        )
      }

      return {
        js: jsCode,
        css: cssCode,
        errors,
        name: componentName,
        scopeId,
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      const safeName = componentName.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
      return {
        js: `var ${COMP_IDENTIFIER} = { name: '${safeName}' };\nexport default ${COMP_IDENTIFIER};`,
        css: '',
        errors: [`Compilation failed: ${errorMsg}`],
        name: componentName,
      }
    }
  }

  /**
   * Compile a JSX/TSX file to ES module format
   */
  async function compileJSX(
    code: string,
    filename = 'anonymous.jsx'
  ): Promise<CompileResult> {
    const errors: string[] = []
    const componentName = filename.replace(/\.(jsx|tsx|js|ts)$/, '').split('/').pop() || 'Component'

    try {
      // Determine file type
      const isTS = filename.endsWith('.tsx') || filename.endsWith('.ts')
      const isJSX = filename.endsWith('.jsx') || filename.endsWith('.tsx')

      // Build Babel presets
      const presets: Array<string | [string, Record<string, unknown>] | unknown> = []

      if (isTS) {
        presets.push(['typescript', { isTSX: isJSX, allExtensions: true }])
      }

      if (isJSX && vue2JsxPreset) {
        presets.push(vue2JsxPreset)
      }

      // Transform code
      let jsCode = code
      if (presets.length > 0) {
        jsCode = await babelTransform(code, { presets: presets as never[], filename })
      }

      // Wrap as ES module
      jsCode = wrapJSXAsModule(jsCode)

      return {
        js: jsCode,
        css: '',
        errors,
        name: componentName,
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      const safeName = componentName.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
      return {
        js: `var ${COMP_IDENTIFIER} = { name: '${safeName}' };\nexport default ${COMP_IDENTIFIER};`,
        css: '',
        errors: [`JSX compilation failed: ${errorMsg}`],
        name: componentName,
      }
    }
  }

  /**
   * Compile JSX/TSX to CommonJS format (for sandbox execution)
   *
   * @param code - JSX/TSX source code
   * @param filename - Filename with extension (e.g., 'Component.tsx')
   * @returns CommonJS result with code, errors
   */
  async function compileJSXToCommonJS(
    code: string,
    filename = 'anonymous.jsx'
  ): Promise<CommonJSResult> {
    const result = await compileJSX(code, filename)

    if (result.errors.length > 0) {
      return {
        js: '',
        css: '',
        errors: result.errors,
        name: result.name,
      }
    }

    // Convert ES module to CommonJS
    let cjsCode = await babelTransform(result.js, {
      plugins: ['transform-modules-commonjs'],
    })

    // Fix Vue.extend() issue
    cjsCode = cjsCode.replace(/_vue\["default"]\.extend\({/g, '({')
    cjsCode = cjsCode.replace(/_vue\.default\.extend\({/g, '({')

    return {
      js: cjsCode,
      css: '',
      errors: result.errors,
      name: result.name,
    }
  }

  /**
   * Compile SFC to CommonJS format (for sandbox execution)
   * Uses Babel transform-modules-commonjs plugin
   *
   * @param code - SFC source code
   * @param name - Component name (e.g., 'MyButton')
   * @returns CommonJS result with code, css, errors
   *
   * @example
   * ```typescript
   * const result = await compiler.compileToCommonJS(sfcCode, 'MyButton')
   * if (result.errors.length === 0) {
   *   // Execute in sandbox with custom require()
   *   const factory = new Function('require', 'module', 'exports', result.js)
   * }
   * ```
   */
  async function compileToCommonJS(
    code: string,
    name: string
  ): Promise<CommonJSResult> {
    const result = await compileSFC(code, name)

    if (result.errors.length > 0) {
      return {
        js: '',
        css: result.css,
        errors: result.errors,
        name: result.name,
        scopeId: result.scopeId,
      }
    }

    // Convert ES module to CommonJS using Babel plugin
    let cjsCode = await babelTransform(result.js, {
      plugins: ['transform-modules-commonjs'],
    })

    // Fix Vue.extend() issue for Vue 2
    // Babel transforms Vue.extend to _vue["default"].extend or _vue.default.extend
    // which breaks when Vue is a global variable, need to restore it
    cjsCode = cjsCode.replace(/_vue\["default"]\.extend\({/g, '({')
    cjsCode = cjsCode.replace(/_vue\.default\.extend\({/g, '({')

    return {
      js: cjsCode,
      css: result.css,
      errors: result.errors,
      name: result.name,
      scopeId: result.scopeId,
    }
  }

  /**
   * Compile SFC directly to UMD format (high-level API)
   * Uses repl-vue2's approach: ESM → CommonJS → clean → UMD wrapper
   *
   * @param code - SFC source code
   * @param name - Component name (e.g., 'MyButton')
   * @param options - UMD options (externals, etc.)
   * @returns UMD result with code, errors, and name
   *
   * @example
   * ```typescript
   * const result = await compiler.compileToUMD(sfcCode, 'MyButton')
   * if (result.errors.length > 0) {
   *   console.error('Errors:', result.errors)
   * }
   * // result.code - UMD code that can be loaded via AMD/CommonJS/script tag
   * // result.name - Component name
   * ```
   */
  async function compileToUMD(
    code: string,
    name: string,
    _options: UMDOptions = {}
  ): Promise<UMDResult> {
    // Step 1: Compile to CommonJS first
    const cjsResult = await compileToCommonJS(code, name)

    if (cjsResult.errors.length > 0) {
      return {
        code: '',
        errors: cjsResult.errors,
        name: cjsResult.name,
      }
    }

    // Step 2: Clean CommonJS code (remove module system statements, replace requires)
    const cleanedCode = cleanCommonJSCode(cjsResult.js)

    // Step 3: Generate UMD wrapper with CSS injection
    const umdCode = generateUMDWrapper(
      cjsResult.name,
      cleanedCode,
      cjsResult.css || ''
    )

    return {
      code: umdCode,
      errors: cjsResult.errors,
      name: cjsResult.name,
    }
  }

  return {
    compileSFC,
    compileJSX,
    compileJSXToCommonJS,
    compileToCommonJS,
    compileToUMD,
    toUMD,
  }
}

/**
 * Wrap JSX code as ES module (consistent with compileSFC output)
 */
function wrapJSXAsModule(code: string): string {
  // Check if there's already a default export
  if (/export\s+default\s+/.test(code)) {
    // Replace export default with variable assignment, then re-export
    code = code.replace(/export\s+default\s+/, `var ${COMP_IDENTIFIER} = `)
    code += `\nexport default ${COMP_IDENTIFIER};`
  } else if (/module\.exports\s*=/.test(code)) {
    // Convert CommonJS to ESM
    code = code.replace(/module\.exports\s*=\s*/, `var ${COMP_IDENTIFIER} = `)
    code += `\nexport default ${COMP_IDENTIFIER};`
  } else {
    // No export found, wrap as IIFE
    code = `var ${COMP_IDENTIFIER} = (function() {\n${code}\n})();\nexport default ${COMP_IDENTIFIER};`
  }

  return code
}
