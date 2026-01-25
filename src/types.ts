/**
 * Type definitions for vue2-sfc-compiler
 */

import type { TransformOptions } from '@babel/core'

/**
 * Babel transform function signature
 * Supports both sync (Node.js) and async (Browser) modes
 */
export type BabelTransformFn = (
  code: string,
  options: TransformOptions
) => string | Promise<string>

/**
 * Style preprocessor function signature
 */
export type StylePreprocessorFn = (
  code: string,
  filename?: string
) => string | Promise<string>

/**
 * Style preprocessors configuration
 */
export interface StylePreprocessors {
  less?: StylePreprocessorFn
  scss?: StylePreprocessorFn
  sass?: StylePreprocessorFn
}

/**
 * Compiler creation options
 */
export interface CompilerOptions {
  /**
   * Babel transform function
   * - Node.js: use @babel/core's transformSync
   * - Browser: use @babel/standalone's transform
   */
  babelTransform: BabelTransformFn

  /**
   * Style preprocessors (optional)
   * Inject less/scss/sass processors as needed
   */
  stylePreprocessors?: StylePreprocessors

  /**
   * Vue 2 JSX Babel preset (optional)
   * From vue2-jsx-browser package
   */
  vue2JsxPreset?: unknown
}

/**
 * Compilation result
 */
export interface CompileResult {
  /** Compiled JavaScript code (CommonJS format) */
  js: string
  /** Compiled CSS (with scoped styles applied) */
  css: string
  /** Compilation errors */
  errors: string[]
  /** Inferred component name from filename */
  name: string
  /** Scoped style ID (e.g., 'data-v-a1b2c3d4'), only present when has scoped styles */
  scopeId?: string
}

/**
 * UMD transformation options
 */
export interface UMDOptions {
  /** Module name for UMD global (auto-extracted from code if not provided) */
  name?: string
  /** External modules mapping (module name -> global variable) */
  externals?: Record<string, string>
  /** CSS to inject (will be auto-injected into document head) */
  css?: string
}

/**
 * UMD compilation result
 */
export interface UMDResult {
  /** UMD formatted code with embedded CSS */
  code: string
  /** Compilation errors */
  errors: string[]
  /** Component name */
  name: string
}

/**
 * Parsed SFC descriptor (simplified)
 */
export interface SFCDescriptor {
  filename: string
  template: {
    content: string
    lang?: string
  } | null
  script: {
    content: string
    lang?: string
    setup?: boolean
  } | null
  scriptSetup: {
    content: string
    lang?: string
  } | null
  styles: Array<{
    content: string
    lang?: string
    scoped?: boolean
  }>
}

/**
 * Compiler instance interface
 */
export interface Compiler {
  /**
   * Compile a Vue 2 SFC file
   * @param code - SFC source code
   * @param name - Component name (e.g., 'MyButton')
   */
  compileSFC(code: string, name: string): CompileResult | Promise<CompileResult>

  /**
   * Compile a JSX/TSX file
   */
  compileJSX(code: string, filename?: string): CompileResult | Promise<CompileResult>

  /**
   * Compile SFC directly to UMD format (high-level API)
   * @param code - SFC source code
   * @param name - Component name (e.g., 'MyButton')
   * @param options - UMD options
   * @returns UMD result with code, errors, and name
   */
  compileToUMD(code: string, name: string, options?: UMDOptions): Promise<UMDResult>

  /**
   * Transform CompileResult to UMD format
   */
  toUMD(input: CompileResult | string, options?: UMDOptions): string
}
