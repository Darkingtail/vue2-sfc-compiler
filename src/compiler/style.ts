/**
 * Style Compiler
 * Compiles Vue 2 style blocks with scoped styles and preprocessor support
 */

import type { SFCDescriptor, StylePreprocessors } from '../types'

/**
 * Options for style compilation
 */
export interface StyleCompileOptions {
  /** Scope ID for scoped styles */
  scopeId?: string
  /** Style preprocessors (less, scss, sass) */
  preprocessors?: StylePreprocessors
}

/**
 * Compile all style blocks from SFC
 * @param descriptor - Parsed SFC descriptor
 * @param options - Compilation options
 * @returns Combined CSS string
 */
export async function compileStyleBlocks(
  descriptor: SFCDescriptor,
  options: StyleCompileOptions = {}
): Promise<string> {
  if (descriptor.styles.length === 0) {
    return ''
  }

  const { scopeId, preprocessors = {} } = options
  const compiledStyles: string[] = []

  for (const style of descriptor.styles) {
    let css = style.content

    // Apply preprocessor if needed
    if (style.lang && preprocessors[style.lang as keyof StylePreprocessors]) {
      const preprocessor = preprocessors[style.lang as keyof StylePreprocessors]!
      css = await preprocessor(css, descriptor.filename)
    }

    // Apply scoped styles
    if (style.scoped && scopeId) {
      css = applyScopedStyles(css, scopeId)
    }

    compiledStyles.push(css)
  }

  return compiledStyles.join('\n')
}

/**
 * Apply scoped attribute to CSS selectors
 * Adds the scopeId as an attribute selector to each rule
 */
function applyScopedStyles(css: string, scopeId: string): string {
  // This is a simplified implementation
  // In production, you might want to use a proper CSS parser like postcss

  // Match CSS selectors (simplified regex)
  // Handles basic selectors but may miss complex cases
  return css.replace(
    /([^\r\n,{}]+)(,(?=[^}]*{)|\s*{)/g,
    (match, selector, suffix) => {
      // Skip @-rules like @media, @keyframes, etc.
      if (selector.trim().startsWith('@')) {
        return match
      }

      // Skip :root, :global, etc.
      if (selector.trim().startsWith(':root') || selector.trim().startsWith(':global')) {
        return match
      }

      // Add scope attribute to selector
      const scopedSelector = addScopeToSelector(selector.trim(), scopeId)
      return scopedSelector + suffix
    }
  )
}

/**
 * Add scope ID to a single selector
 */
function addScopeToSelector(selector: string, scopeId: string): string {
  // Handle pseudo-elements and pseudo-classes
  const pseudoMatch = selector.match(/(::.+|:.+)$/)

  if (pseudoMatch) {
    // Insert scope before pseudo
    const base = selector.slice(0, -pseudoMatch[0].length)
    return `${base}[${scopeId}]${pseudoMatch[0]}`
  }

  // Handle deep selectors (::v-deep, /deep/, >>>)
  if (selector.includes('::v-deep') || selector.includes('/deep/') || selector.includes('>>>')) {
    // Split at deep combinator
    const deepPatterns = [/::v-deep\s*/, /\/deep\/\s*/, />>>\s*/]
    for (const pattern of deepPatterns) {
      if (pattern.test(selector)) {
        const parts = selector.split(pattern)
        if (parts.length === 2) {
          // Add scope to first part, leave second part unscoped
          return `${parts[0].trim()}[${scopeId}] ${parts[1].trim()}`
        }
      }
    }
  }

  // Simple case: add attribute selector at the end
  return `${selector}[${scopeId}]`
}

/**
 * Generate code to inject styles into the document
 */
export function generateStyleInjection(css: string): string {
  if (!css) {
    return ''
  }

  // Escape CSS for use in JavaScript string
  const escapedCss = css
    .replace(/\\/g, '\\\\')
    .replace(/`/g, '\\`')
    .replace(/\$/g, '\\$')

  return `
(function() {
  var css = \`${escapedCss}\`;
  var style = document.createElement('style');
  style.type = 'text/css';
  style.appendChild(document.createTextNode(css));
  document.head.appendChild(style);
})();`
}
