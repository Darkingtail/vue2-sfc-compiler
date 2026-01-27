/**
 * UMD Transformer
 * Converts ESM/CommonJS module to UMD format for browser execution
 */

import type { UMDOptions } from '../types'

/**
 * Default external modules mapping
 * Maps module paths to global variable names
 */
const DEFAULT_EXTERNALS: Record<string, string> = {
  vue: 'Vue',
}

/**
 * Parse ESM import statements and convert to variable declarations
 * @param code - Source code with import statements
 * @param externals - Module to global variable mapping
 * @returns Object with cleaned code and variable declarations
 */
function convertImportsToVars(
  code: string,
  externals: Record<string, string>
): { code: string; varDeclarations: string[] } {
  const varDeclarations: string[] = []
  let result = code

  // Match: import { a, b as c } from 'module'
  // Match: import Vue from 'vue'
  // Match: import Vue, { ref, reactive } from 'vue'
  const importRegex = /import\s+(?:(\w+)\s*,?\s*)?(?:\{\s*([^}]+)\s*\})?\s*from\s*['"]([^'"]+)['"]\s*;?/g

  result = result.replace(importRegex, (_, defaultImport, namedImportsStr, moduleName) => {
    const globalVar = externals[moduleName]
    if (!globalVar) {
      // Unknown module, keep as comment for debugging
      return `// [UMD] Unknown module: ${moduleName}`
    }

    // Handle default import: import Vue from 'vue'
    if (defaultImport) {
      varDeclarations.push(`var ${defaultImport} = ${globalVar};`)
    }

    // Handle named imports: import { ref, reactive as r } from 'vue'
    if (namedImportsStr) {
      const namedImports = namedImportsStr.split(',').map((s: string) => s.trim())
      for (const imp of namedImports) {
        const [name, alias] = imp.split(/\s+as\s+/).map((s: string) => s.trim())
        const varName = alias || name
        // Vue 2.7 composition API is on Vue object directly
        varDeclarations.push(`var ${varName} = ${globalVar}.${name};`)
      }
    }

    return '' // Remove the import statement
  })

  return { code: result, varDeclarations }
}

/**
 * Clean CommonJS boilerplate from compiled code
 * Removes __esModule, Object.defineProperty patterns, etc.
 */
function cleanCommonJSBoilerplate(code: string): string {
  return code
    // Remove "use strict" directive
    .replace(/["']use strict["'];?\s*/g, '')
    // Remove __esModule definition (multiple patterns)
    .replace(/Object\.defineProperty\s*\(\s*exports\s*,\s*["']__esModule["']\s*,\s*\{[^}]*\}\s*\)\s*;?/g, '')
    // Remove exports.__esModule = true
    .replace(/exports\.__esModule\s*=\s*true\s*;?/g, '')
    // Remove exports["default"] = void 0; or exports.default = void 0;
    .replace(/exports(?:\["default"\]|\.default)\s*=\s*void\s+0\s*;?/g, '')
    // Trim whitespace
    .trim()
}

/**
 * Replace require() calls with global variable references
 */
function replaceRequires(code: string, externals: Record<string, string>): string {
  let result = code

  for (const [moduleName, globalVar] of Object.entries(externals)) {
    // Match require("moduleName") or require('moduleName')
    const requirePattern = new RegExp(
      `require\\s*\\(\\s*["']${moduleName}["']\\s*\\)`,
      'g'
    )
    result = result.replace(requirePattern, globalVar)
  }

  return result
}

/**
 * Extract the default export from code
 * Handles ESM (export default), CJS (exports.default, exports["default"]), and module.exports patterns
 */
function extractExport(code: string): { code: string; exportVar: string } {
  // Check for ESM: export default __sfc__ pattern
  const esmExportMatch = code.match(/export\s+default\s+(\w+)\s*;?/)
  if (esmExportMatch) {
    const exportVar = esmExportMatch[1]
    const cleanedCode = code.replace(/export\s+default\s+\w+\s*;?/g, '')
    return { code: cleanedCode, exportVar }
  }

  // Check for CJS: exports["default"] = __sfc__ or exports.default = __sfc__
  // Also handle: var _default = exports["default"] = __sfc__
  // Also handle: exports["default"] = _default = __sfc__

  // First, try to find the component variable (__sfc__ or similar)
  const componentVarMatch = code.match(/(?:var|const|let)\s+(__sfc__)\s*=/)
  if (componentVarMatch) {
    const exportVar = componentVarMatch[1]
    // Remove all export-related statements
    let cleanedCode = code
      // Remove: var _default = exports["default"] = ...
      .replace(/(?:var|const|let)\s+\w+\s*=\s*exports(?:\["default"\]|\.default)\s*=\s*[^;]+;?/g, '')
      // Remove: exports["default"] = _default = ...
      .replace(/exports(?:\["default"\]|\.default)\s*=\s*\w+\s*=\s*[^;]+;?/g, '')
      // Remove: exports["default"] = __sfc__
      .replace(/exports(?:\["default"\]|\.default)\s*=\s*\w+\s*;?/g, '')
    return { code: cleanedCode, exportVar }
  }

  // Fallback: try to extract from exports assignment
  const defaultExportMatch = code.match(/exports(?:\.default|\["default"\])\s*=\s*(\w+)\s*;?/)
  if (defaultExportMatch) {
    const exportVar = defaultExportMatch[1]
    let cleanedCode = code
      .replace(/(?:var|const|let)\s+\w+\s*=\s*exports(?:\["default"\]|\.default)\s*=\s*[^;]+;?/g, '')
      .replace(/exports(?:\["default"\]|\.default)\s*=\s*\w+\s*=\s*[^;]+;?/g, '')
      .replace(/exports(?:\["default"\]|\.default)\s*=\s*\w+\s*;?/g, '')
    return { code: cleanedCode, exportVar }
  }

  // Check for module.exports = pattern
  const moduleExportsMatch = code.match(/module\.exports\s*=\s*(\w+)\s*;?/)
  if (moduleExportsMatch) {
    const exportVar = moduleExportsMatch[1]
    const cleanedCode = code.replace(/module\.exports\s*=\s*\w+\s*;?/g, '')
    return { code: cleanedCode, exportVar }
  }

  // Default: assume __sfc__ is the export
  return { code, exportVar: '__sfc__' }
}

/**
 * Simple hash function for CSS content
 * Returns a short hex string for uniqueness
 */
function hashCSS(css: string): string {
  let hash = 0
  for (let i = 0; i < css.length; i++) {
    const char = css.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash // Convert to 32-bit integer
  }
  return Math.abs(hash).toString(16).slice(0, 8)
}

/**
 * Generate CSS injection code
 * @param css - CSS content to inject
 * @param name - Component name
 */
function generateCSSInjection(css: string, name: string): string {
  if (!css || !css.trim()) return ''

  // Escape CSS for embedding in JS string
  const escapedCSS = css
    .replace(/\\/g, '\\\\')
    .replace(/`/g, '\\`')
    .replace(/\$/g, '\\$')

  // Use name + CSS content hash for unique style id
  const cssHash = hashCSS(css)
  const styleId = `${name}-${cssHash}-style`

  return `
  // Inject component styles
  (function() {
    var styleId = '${styleId}';
    if (!document.getElementById(styleId)) {
      var style = document.createElement('style');
      style.id = styleId;
      style.textContent = \`${escapedCSS}\`;
      document.head.appendChild(style);
    }
  })();
`
}

/**
 * Generate UMD wrapper
 * @param code - Component code body
 * @param exportVar - Variable name to export
 * @param name - Component name for global registration
 * @param css - Optional CSS to inject
 * @param varDeclarations - Variable declarations from import conversion
 */
function wrapInUMD(
  code: string,
  exportVar: string,
  name: string,
  css?: string,
  varDeclarations: string[] = []
): string {
  const cssInjection = generateCSSInjection(css || '', name)
  const varsBlock = varDeclarations.length > 0
    ? '\n  ' + varDeclarations.join('\n  ') + '\n'
    : ''

  return `(function (global, factory) {
  typeof exports === 'object' && typeof module !== 'undefined' ? module.exports = factory(require('vue')) :
  typeof define === 'function' && define.amd ? define(['vue'], factory) :
  (global = typeof globalThis !== 'undefined' ? globalThis : global || self, global["${name}"] = factory(global.Vue));
})(this, (function (Vue) {
  'use strict';
${cssInjection}${varsBlock}
${code}

  return ${exportVar};
}));`
}

/**
 * Extract component name from compiled JS code
 * Matches patterns like: __sfc__.name = "MyComponent" or name: "MyComponent"
 */
function extractNameFromCode(js: string): string | null {
  // Match __sfc__.name = "Name" or __sfc__.name = 'Name'
  const sfcNameMatch = js.match(/__sfc__\.name\s*=\s*["']([^"']+)["']/)
  if (sfcNameMatch) return sfcNameMatch[1]

  // Match name: "Name" in object literal
  const namePropertyMatch = js.match(/name\s*:\s*["']([^"']+)["']/)
  if (namePropertyMatch) return namePropertyMatch[1]

  return null
}

/**
 * Transform compiled result to UMD format
 * @param input - CompileResult object or JS string (for backward compatibility)
 * @param options - UMD transformation options
 * @returns UMD formatted code with embedded CSS injection
 *
 * @example
 * ```typescript
 * const result = await compiler.compileSFC(sfcCode, 'MyButton.vue')
 * const umdCode = toUMD(result)  // Simple - uses result.js, result.css, result.name
 * ```
 *
 * @example
 * ```typescript
 * // With custom options
 * const umdCode = toUMD(result, {
 *   name: 'CustomName',
 *   externals: { 'element-ui': 'ELEMENT' }
 * })
 * ```
 */
export function toUMD(
  input: { js: string; css?: string; name?: string } | string,
  options: UMDOptions = {}
): string {
  // Support both CompileResult object and raw JS string
  const js = typeof input === 'string' ? input : input.js
  const inputCss = typeof input === 'string' ? undefined : input.css
  const inputName = typeof input === 'string' ? undefined : input.name

  const { externals = {} } = options
  // Priority: options.name > input.name > extracted from code > 'Component'
  const css = options.css ?? inputCss
  const name = options.name || inputName || extractNameFromCode(js) || 'Component'

  // Merge with default externals
  const allExternals = { ...DEFAULT_EXTERNALS, ...externals }

  // Step 1: Clean CommonJS boilerplate
  let code = cleanCommonJSBoilerplate(js)

  // Step 2: Convert ESM imports to variable declarations
  const { code: codeWithoutImports, varDeclarations } = convertImportsToVars(code, allExternals)
  code = codeWithoutImports

  // Step 3: Replace any remaining require() calls (for CommonJS input)
  code = replaceRequires(code, allExternals)

  // Step 4: Extract export
  const { code: bodyCode, exportVar } = extractExport(code)

  // Step 5: Wrap in UMD (with CSS injection and variable declarations)
  return wrapInUMD(bodyCode.trim(), exportVar, name, css, varDeclarations)
}
