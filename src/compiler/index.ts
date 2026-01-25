/**
 * Compiler module exports
 */

export { compileScriptBlock, COMP_IDENTIFIER } from './script'
export type { ScriptCompileOptions } from './script'

export { compileTemplateBlock, attachTemplateString } from './template'
export type { TemplateCompileOptions } from './template'

export { compileStyleBlocks, generateStyleInjection } from './style'
export type { StyleCompileOptions } from './style'
