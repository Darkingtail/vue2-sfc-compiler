/**
 * SFC Parser - Parse Vue Single File Components
 * Uses @vue/compiler-sfc from Vue 2.7 for native Vue 2 SFC support
 */

import { parse as vueParse } from '@vue/compiler-sfc'
import type { SFCDescriptor } from './types'

/**
 * Parse a Vue SFC file into its constituent parts
 * @param code - The SFC source code
 * @param filename - The SFC filename (required for scoped CSS and error reporting)
 * @returns Parsed SFC descriptor
 */
export function parseSFC(code: string, filename: string): SFCDescriptor {
  // Vue 3 parse API: parse(code, options) returns { descriptor, errors }
  const { descriptor, errors } = vueParse(code, {
    filename,
    sourceMap: false,
  })

  if (errors && errors.length > 0) {
    console.warn('SFC parse warnings:', errors)
  }

  return {
    filename,
    template: descriptor.template
      ? {
          content: descriptor.template.content,
          lang: descriptor.template.lang,
        }
      : null,
    script: descriptor.script
      ? {
          content: descriptor.script.content,
          lang: descriptor.script.lang,
          setup: false,
        }
      : null,
    scriptSetup: descriptor.scriptSetup
      ? {
          content: descriptor.scriptSetup.content,
          lang: descriptor.scriptSetup.lang,
        }
      : null,
    styles: descriptor.styles.map((style: { content: string; lang?: string; scoped?: boolean }) => ({
      content: style.content,
      lang: style.lang,
      scoped: style.scoped,
    })),
  }
}

/**
 * Generate a unique scope ID for scoped styles
 * @param filename - The SFC filename
 * @param content - Optional SFC source content for unique hash generation
 * @returns A unique scope ID string
 */
export function generateScopeId(filename: string, content?: string): string {
  // Combine filename and content for unique hash
  const source = content ? `${filename}:${content}` : filename

  // Simple hash function for generating scope ID
  let hash = 0
  for (let i = 0; i < source.length; i++) {
    const char = source.charCodeAt(i)
    hash = (hash << 5) - hash + char
    hash = hash & hash // Convert to 32bit integer
  }
  return `data-v-${Math.abs(hash).toString(16).slice(0, 8)}`
}
