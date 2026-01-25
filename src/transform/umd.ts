/**
 * UMD Transformer
 * Converts CommonJS module to UMD format for browser execution
 */

import type { UMDOptions } from '../types'

/**
 * Default external modules mapping
 * Maps CommonJS require paths to global variable names
 */
const DEFAULT_EXTERNALS: Record<string, string> = {
  vue: 'Vue',
}

/**
 * Clean CommonJS boilerplate from compiled code
 * Removes __esModule, Object.defineProperty patterns, etc.
 */
function cleanCommonJSBoilerplate(code: string): string {
  return code
    // Remove "use strict" directive
    .replace(/["']use strict["'];?\s*/g, '')
    // Remove __esModule definition
    .replace(/Object\.defineProperty\s*\(\s*exports\s*,\s*["']__esModule["']\s*,\s*\{\s*value\s*:\s*true\s*\}\s*\)\s*;?/g, '')
    // Remove exports.__esModule = true
    .replace(/exports\.__esModule\s*=\s*true\s*;?/g, '')
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
 * Handles ESM (export default), CJS (exports.default), and module.exports patterns
 */
function extractExport(code: string): { code: string; exportVar: string } {
  // Check for ESM: export default __sfc__ pattern
  const esmExportMatch = code.match(/export\s+default\s+(\w+)\s*;?/)
  if (esmExportMatch) {
    const exportVar = esmExportMatch[1]
    const cleanedCode = code.replace(/export\s+default\s+\w+\s*;?/g, '')
    return { code: cleanedCode, exportVar }
  }

  // Check for CJS: exports.default = __sfc__ pattern
  const defaultExportMatch = code.match(/exports\.default\s*=\s*(\w+)\s*;?/)
  if (defaultExportMatch) {
    const exportVar = defaultExportMatch[1]
    const cleanedCode = code.replace(/exports\.default\s*=\s*\w+\s*;?/g, '')
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
 */
function wrapInUMD(code: string, exportVar: string, name: string, css?: string): string {
  const cssInjection = generateCSSInjection(css || '', name)

  return `(function (global, factory) {
  typeof exports === 'object' && typeof module !== 'undefined' ? module.exports = factory(require('vue')) :
  typeof define === 'function' && define.amd ? define(['vue'], factory) :
  (global = typeof globalThis !== 'undefined' ? globalThis : global || self, global["${name}"] = factory(global.Vue));
})(this, (function (Vue) {
  'use strict';
${cssInjection}
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

  // Step 2: Replace require() calls
  code = replaceRequires(code, allExternals)

  // Step 3: Extract export
  const { code: bodyCode, exportVar } = extractExport(code)

  // Step 4: Wrap in UMD (with CSS injection if provided)
  return wrapInUMD(bodyCode.trim(), exportVar, name, css)
}
