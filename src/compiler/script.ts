/**
 * Script Compiler
 * Compiles Vue 2 script blocks with TypeScript and setup support
 */

import { parse, compileScript, rewriteDefault } from '@vue/compiler-sfc'
import type { SFCScriptCompileOptions } from '@vue/compiler-sfc'
import type { BabelTransformFn, SFCDescriptor } from '../types'

/** Component identifier used in compiled output */
export const COMP_IDENTIFIER = '__sfc__'

/**
 * Options for script compilation
 */
export interface ScriptCompileOptions {
  /** Babel transform function */
  babelTransform: BabelTransformFn
  /** Vue 2 JSX preset (optional) */
  vue2JsxPreset?: unknown
  /** Scope ID for scoped styles */
  scopeId?: string
  /** Original SFC source code (required for script setup) */
  source?: string
}

/**
 * Extract component names from import statements in script setup
 * Matches: import Comp from './Comp.vue', './Comp.tsx', or './Comp.jsx'
 */
function extractImportedComponents(scriptContent: string): string[] {
  const components: string[] = []
  const importRegex = /import\s+(\w+)\s+from\s+['"][^'"]+\.(vue|tsx|jsx)['"]/g
  let match
  while ((match = importRegex.exec(scriptContent)) !== null) {
    components.push(match[1])
  }
  return components
}

/**
 * Compile script block from SFC
 * Handles both regular script and script setup
 */
export async function compileScriptBlock(
  descriptor: SFCDescriptor,
  options: ScriptCompileOptions
): Promise<string> {
  const { babelTransform, vue2JsxPreset, scopeId, source } = options
  const hasSetup = !!descriptor.scriptSetup
  const hasScript = !!descriptor.script

  if (!hasSetup && !hasScript) {
    // No script block, return empty component
    return `var ${COMP_IDENTIFIER} = {};`
  }

  let scriptCode: string
  const scriptLang = descriptor.scriptSetup?.lang || descriptor.script?.lang || 'js'

  // Determine parser plugins for @vue/compiler-sfc
  const expressionPlugins: ('typescript' | 'jsx')[] = []
  if (scriptLang === 'ts' || scriptLang === 'tsx') {
    expressionPlugins.push('typescript')
  }

  if (hasSetup && source) {
    // For script setup, we need to re-parse the original source
    // to get the full descriptor that @vue/compiler-sfc needs
    // Vue 3 parse API: parse(code, options) returns { descriptor, errors }
    const { descriptor: fullDescriptor, errors: parseErrors } = parse(source, {
      filename: descriptor.filename,
      sourceMap: false,
    })

    if (parseErrors && parseErrors.length > 0) {
      throw new Error(`SFC parse error: ${parseErrors.map((e: unknown) => typeof e === 'string' ? e : (e as { message: string }).message).join(', ')}`)
    }

    try {
      // Vue 3 compileScript options
      const compiled = compileScript(fullDescriptor, {
        babelParserPlugins: expressionPlugins as SFCScriptCompileOptions['babelParserPlugins'],
        id: scopeId || 'data-v-anonymous',
        inlineTemplate: false,
        isProd: false,
      })

      let content = compiled.content

      // Use rewriteDefault to properly handle export default
      content = rewriteDefault(
        content,
        COMP_IDENTIFIER,
        expressionPlugins as SFCScriptCompileOptions['babelParserPlugins']
      )

      // For script setup, extract imported components and register them
      if (descriptor.scriptSetup) {
        const importedComponents = extractImportedComponents(descriptor.scriptSetup.content)
        if (importedComponents.length > 0) {
          const componentsCode = importedComponents.map((name) => `"${name}": ${name}`).join(', ')
          content += `\n${COMP_IDENTIFIER}.components = { ${componentsCode} };`
        }
      }

      scriptCode = content
    } catch (error) {
      throw new Error(`Script setup compilation failed: ${error}`)
    }
  } else if (hasSetup) {
    // Script setup without source - this shouldn't happen in normal use
    throw new Error('Script setup requires original source code')
  } else {
    // Regular script block - use rewriteDefault
    let content = descriptor.script!.content
    content = rewriteDefault(
      content,
      COMP_IDENTIFIER,
      expressionPlugins as SFCScriptCompileOptions['babelParserPlugins']
    )
    scriptCode = content
  }

  // Determine if we need TypeScript transformation
  const isTS = scriptLang === 'ts' || scriptLang === 'tsx'
  const isJSX = scriptLang === 'jsx' || scriptLang === 'tsx'

  // Build Babel presets
  const presets: unknown[] = []

  if (isTS) {
    presets.push(['typescript', { isTSX: isJSX, allExtensions: true, onlyRemoveTypeImports: true }])
  }

  if (isJSX && vue2JsxPreset) {
    presets.push(vue2JsxPreset)
  }

  // Transform with Babel if needed
  if (presets.length > 0) {
    scriptCode = await babelTransform(scriptCode, {
      presets: presets as never[],
      filename: descriptor.filename,
    })
  }

  // Add scope ID if provided (Vue 2 uses _scopeId)
  if (scopeId) {
    scriptCode += `\n${COMP_IDENTIFIER}._scopeId = "${scopeId}";`
  }

  // Add ES module export
  scriptCode += `\nexport default ${COMP_IDENTIFIER};`

  return scriptCode
}
