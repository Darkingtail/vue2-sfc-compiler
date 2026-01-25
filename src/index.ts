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
import type { CompilerOptions, CompileResult, Compiler, UMDOptions, UMDResult } from './types'

// Re-export types
export type {
  CompilerOptions,
  CompileResult,
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
   * Compile a JSX/TSX file
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

      // Wrap as CommonJS module
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
   * Compile SFC directly to UMD format (high-level API)
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
   * // result.code - UMD code
   * // result.name - Component name
   * ```
   */
  async function compileToUMD(
    code: string,
    name: string,
    options: UMDOptions = {}
  ): Promise<UMDResult> {
    const result = await compileSFC(code, name)
    return {
      code: toUMD(result, options),
      errors: result.errors,
      name: result.name,
    }
  }

  return {
    compileSFC,
    compileJSX,
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
