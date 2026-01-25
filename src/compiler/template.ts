/**
 * Template Compiler
 * Compiles Vue 2 template blocks to render functions
 */

import { compileTemplate } from '@vue/compiler-sfc'
import type { SFCDescriptor } from '../types'
import { COMP_IDENTIFIER } from './script'

/**
 * Options for template compilation
 */
export interface TemplateCompileOptions {
  /** Scope ID for scoped styles */
  scopeId?: string
  /** Whether to use function mode (for Vue 2 runtime) */
  functionMode?: boolean
}

/**
 * Compile template block to render function
 * @param descriptor - Parsed SFC descriptor
 * @param options - Compilation options
 * @returns JavaScript code that adds render function to component
 */
export function compileTemplateBlock(
  descriptor: SFCDescriptor,
  options: TemplateCompileOptions = {}
): string {
  if (!descriptor.template) {
    return ''
  }

  const { scopeId, functionMode = true } = options

  try {
    const result = compileTemplate({
      id: scopeId || 'data-v-anonymous',
      source: descriptor.template.content,
      filename: descriptor.filename,
      scoped: !!scopeId,
      compilerOptions: {
        mode: functionMode ? 'function' : 'module',
        // Vue 2 compatible options
        prefixIdentifiers: false,
        hoistStatic: false,
        cacheHandlers: false,
      },
    })

    if (result.errors.length > 0) {
      console.warn('Template compilation warnings:', result.errors)
    }

    // For Vue 2, we need to attach the render function to the component
    // The compiled result is a function that takes (Vue) and returns { render, staticRenderFns }
    return generateRenderCode(result.code, functionMode)
  } catch (error) {
    throw new Error(`Template compilation failed: ${error}`)
  }
}

/**
 * Generate code to attach render function to component
 */
function generateRenderCode(compiledCode: string, functionMode: boolean): string {
  if (functionMode) {
    // Function mode: the code is a render function body
    // We need to wrap it and attach to the component
    return `
(function() {
  ${compiledCode}
  ${COMP_IDENTIFIER}.render = render;
  if (typeof staticRenderFns !== 'undefined') {
    ${COMP_IDENTIFIER}.staticRenderFns = staticRenderFns;
  }
})();`
  }

  // Module mode: import the render function
  return compiledCode
}

/**
 * For Vue 2 runtime compilation (template as string)
 * Use this when you want Vue to compile the template at runtime
 */
export function attachTemplateString(
  descriptor: SFCDescriptor
): string {
  if (!descriptor.template) {
    return ''
  }

  // Escape the template for use as a JavaScript string
  const escapedTemplate = descriptor.template.content
    .replace(/\\/g, '\\\\')
    .replace(/`/g, '\\`')
    .replace(/\$/g, '\\$')

  return `${COMP_IDENTIFIER}.template = \`${escapedTemplate}\`;`
}
