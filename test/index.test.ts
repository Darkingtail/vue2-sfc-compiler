import { describe, it, expect, vi } from 'vitest';
import * as babel from '@babel/core';
import {
  createCompiler,
  parseSFC,
  generateScopeId,
  toUMD,
  COMP_IDENTIFIER,
  createVue2JsxPreset,
  babelPluginTransformVueJsx,
  babelSugarFunctionalVue,
  babelSugarVModel,
  babelSugarVOn,
  attachTemplateString,
  compileStyleBlocks,
  compileTemplateBlock,
  generateStyleInjection,
} from '../src/index';

// --- Exports ---

describe('exports', () => {
  it('should export createCompiler', () => {
    expect(createCompiler).toBeDefined();
    expect(typeof createCompiler).toBe('function');
  });

  it('should export parseSFC', () => {
    expect(parseSFC).toBeDefined();
    expect(typeof parseSFC).toBe('function');
  });

  it('should export generateScopeId', () => {
    expect(generateScopeId).toBeDefined();
    expect(typeof generateScopeId).toBe('function');
  });

  it('should export toUMD', () => {
    expect(toUMD).toBeDefined();
    expect(typeof toUMD).toBe('function');
  });

  it('should export COMP_IDENTIFIER as __sfc__', () => {
    expect(COMP_IDENTIFIER).toBe('__sfc__');
  });

  it('should re-export vue2-jsx-browser plugins', () => {
    expect(createVue2JsxPreset).toBeDefined();
    expect(babelPluginTransformVueJsx).toBeDefined();
    expect(babelSugarFunctionalVue).toBeDefined();
    expect(babelSugarVModel).toBeDefined();
    expect(babelSugarVOn).toBeDefined();
  });

  it('should export template and style utilities', () => {
    expect(attachTemplateString).toBeDefined();
    expect(compileStyleBlocks).toBeDefined();
    expect(compileTemplateBlock).toBeDefined();
    expect(generateStyleInjection).toBeDefined();
  });
});

// --- parseSFC ---

describe('parseSFC', () => {
  it('should parse a basic SFC with template, script, and style', () => {
    const code = `
<template>
  <div>Hello</div>
</template>
<script>
export default { name: 'Hello' }
</script>
<style>
.hello { color: red; }
</style>`;
    const result = parseSFC(code, 'Hello.vue');

    expect(result.filename).toBe('Hello.vue');
    expect(result.template).not.toBeNull();
    expect(result.template!.content).toContain('<div>Hello</div>');
    expect(result.script).not.toBeNull();
    expect(result.script!.content).toContain("name: 'Hello'");
    expect(result.styles).toHaveLength(1);
    expect(result.styles[0].content).toContain('.hello');
  });

  it('should parse SFC with script setup', () => {
    const code = `
<template>
  <div>{{ msg }}</div>
</template>
<script setup>
const msg = 'hello'
</script>`;
    const result = parseSFC(code, 'Setup.vue');

    expect(result.scriptSetup).not.toBeNull();
    expect(result.scriptSetup!.content).toContain("const msg = 'hello'");
  });

  it('should parse SFC with scoped style', () => {
    const code = `
<template><div /></template>
<style scoped>
.foo { color: blue; }
</style>`;
    const result = parseSFC(code, 'Scoped.vue');

    expect(result.styles).toHaveLength(1);
    expect(result.styles[0].scoped).toBe(true);
  });

  it('should parse SFC with TypeScript script', () => {
    const code = `
<template><div /></template>
<script lang="ts">
import { defineComponent } from 'vue'
export default defineComponent({ name: 'TSComp' })
</script>`;
    const result = parseSFC(code, 'TS.vue');

    expect(result.script!.lang).toBe('ts');
  });

  it('should parse SFC with no script block', () => {
    const code = `<template><div>No script</div></template>`;
    const result = parseSFC(code, 'NoScript.vue');

    expect(result.script).toBeNull();
    expect(result.scriptSetup).toBeNull();
    expect(result.template).not.toBeNull();
  });

  it('should parse SFC with multiple styles', () => {
    const code = `
<template><div /></template>
<style>.a { color: red; }</style>
<style scoped>.b { color: blue; }</style>`;
    const result = parseSFC(code, 'Multi.vue');

    expect(result.styles).toHaveLength(2);
    expect(result.styles[0].scoped).toBeFalsy();
    expect(result.styles[1].scoped).toBe(true);
  });

  it('should parse SFC with less style', () => {
    const code = `
<template><div /></template>
<style lang="less">.parent { .child { color: red; } }</style>`;
    const result = parseSFC(code, 'Less.vue');

    expect(result.styles[0].lang).toBe('less');
  });
});

// --- generateScopeId ---

describe('generateScopeId', () => {
  it('should return a string starting with data-v-', () => {
    const id = generateScopeId('test.vue');
    expect(id).toMatch(/^data-v-[0-9a-f]+$/);
  });

  it('should return different IDs for different filenames', () => {
    const id1 = generateScopeId('a.vue');
    const id2 = generateScopeId('b.vue');
    expect(id1).not.toBe(id2);
  });

  it('should return different IDs when content differs', () => {
    const id1 = generateScopeId('test.vue', 'content1');
    const id2 = generateScopeId('test.vue', 'content2');
    expect(id1).not.toBe(id2);
  });

  it('should be deterministic', () => {
    const id1 = generateScopeId('test.vue', 'same');
    const id2 = generateScopeId('test.vue', 'same');
    expect(id1).toBe(id2);
  });
});

// --- toUMD ---

describe('toUMD', () => {
  it('should wrap code in UMD format from string input', () => {
    const code = `var __sfc__ = { name: 'Test' };\nexport default __sfc__;`;
    const result = toUMD(code, { name: 'TestComp' });

    expect(result).toContain('typeof exports');
    expect(result).toContain('typeof define');
    expect(result).toContain('TestComp');
    expect(result).toContain("name: 'Test'");
  });

  it('should wrap code in UMD format from object input', () => {
    const result = toUMD(
      { js: `var __sfc__ = {};\nexport default __sfc__;`, css: '.foo { color: red; }', name: 'MyComp' },
    );

    expect(result).toContain('MyComp');
    expect(result).toContain('.foo');
    expect(result).toContain('color: red');
  });

  it('should handle import statements', () => {
    const code = `import { ref } from 'vue';\nvar __sfc__ = {};\nexport default __sfc__;`;
    const result = toUMD(code, { name: 'Comp' });

    // Import should be converted to var declaration
    expect(result).not.toContain("import { ref } from 'vue'");
    expect(result).toContain('Vue.ref');
  });

  it('should handle custom externals', () => {
    const code = `import ElementUI from 'element-ui';\nvar __sfc__ = {};\nexport default __sfc__;`;
    const result = toUMD(code, { name: 'Comp', externals: { 'element-ui': 'ELEMENT' } });

    expect(result).toContain('ELEMENT');
  });

  it('should extract component name from code if not provided', () => {
    const code = `var __sfc__ = {};\n__sfc__.name = "AutoName";\nexport default __sfc__;`;
    const result = toUMD(code);

    expect(result).toContain('AutoName');
  });

  it('should use "Component" as fallback name', () => {
    const code = `var __sfc__ = {};\nexport default __sfc__;`;
    const result = toUMD(code);

    expect(result).toContain('"Component"');
  });
});

// --- createCompiler ---

describe('createCompiler', () => {
  // Normalize plugin names: @babel/standalone uses short names like 'transform-modules-commonjs',
  // but @babel/core expects full names like '@babel/plugin-transform-modules-commonjs'
  const babelTransform = (code: string, options: babel.TransformOptions) => {
    const normalizedOptions = { ...options };
    if (normalizedOptions.plugins) {
      normalizedOptions.plugins = (normalizedOptions.plugins as unknown[]).map((p) =>
        typeof p === 'string' && !p.startsWith('@') && !p.startsWith('/')
          ? `@babel/plugin-${p}`
          : p
      ) as babel.PluginItem[];
    }
    const result = babel.transformSync(code, normalizedOptions);
    return result?.code || '';
  };

  it('should return a compiler with all methods', () => {
    const compiler = createCompiler({ babelTransform });

    expect(compiler.compileSFC).toBeDefined();
    expect(compiler.compileJSX).toBeDefined();
    expect(compiler.compileJSXToCommonJS).toBeDefined();
    expect(compiler.compileToCommonJS).toBeDefined();
    expect(compiler.compileToUMD).toBeDefined();
    expect(compiler.toUMD).toBeDefined();
  });

  describe('compileSFC', () => {
    it('should compile a basic SFC', async () => {
      const compiler = createCompiler({ babelTransform });
      const code = `
<template>
  <div>Hello</div>
</template>
<script>
export default { name: 'Hello' }
</script>`;
      const result = await compiler.compileSFC(code, 'Hello');

      expect(result.js).toContain('__sfc__');
      expect(result.js).toContain('export default');
      expect(result.errors).toHaveLength(0);
      expect(result.name).toBe('Hello');
    });

    it('should strip .vue extension from name', async () => {
      const compiler = createCompiler({ babelTransform });
      const code = `<template><div /></template><script>export default {}</script>`;
      const result = await compiler.compileSFC(code, 'MyComp.vue');

      expect(result.name).toBe('MyComp');
    });

    it('should compile SFC with styles', async () => {
      const compiler = createCompiler({ babelTransform });
      const code = `
<template><div class="box">Test</div></template>
<script>export default {}</script>
<style>.box { color: red; }</style>`;
      const result = await compiler.compileSFC(code, 'Styled');

      expect(result.css).toContain('.box');
      expect(result.css).toContain('color: red');
    });

    it('should compile SFC with scoped styles and generate scopeId', async () => {
      const compiler = createCompiler({ babelTransform });
      const code = `
<template><div>Scoped</div></template>
<script>export default {}</script>
<style scoped>.item { color: blue; }</style>`;
      const result = await compiler.compileSFC(code, 'Scoped');

      expect(result.scopeId).toBeDefined();
      expect(result.scopeId).toMatch(/^data-v-/);
      expect(result.css).toContain(result.scopeId!);
    });

    it('should attach template as string for runtime compilation', async () => {
      const compiler = createCompiler({ babelTransform });
      const code = `
<template>
  <div>{{ msg }}</div>
</template>
<script>
export default { data() { return { msg: 'hi' } } }
</script>`;
      const result = await compiler.compileSFC(code, 'Template');

      expect(result.js).toContain('__sfc__.template');
    });

    it('should handle compile error gracefully', async () => {
      const failTransform = () => { throw new Error('Babel failed'); };
      const compiler = createCompiler({ babelTransform: failTransform });
      const code = `
<template><div /></template>
<script lang="ts">
const x: number = 1
export default { data() { return { x } } }
</script>`;
      const result = await compiler.compileSFC(code, 'Fail');

      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should infer component name if not in script', async () => {
      const compiler = createCompiler({ babelTransform });
      const code = `
<template><div /></template>
<script>export default {}</script>`;
      const result = await compiler.compileSFC(code, 'InferredName');

      expect(result.js).toContain('InferredName');
    });
  });

  describe('compileJSX', () => {
    it('should compile basic JSX', async () => {
      const compiler = createCompiler({ babelTransform });
      const code = `export default { render(h) { return <div>Hello</div> } }`;
      const result = await compiler.compileJSX(code, 'comp.jsx');

      expect(result.js).toContain('__sfc__');
      expect(result.errors).toHaveLength(0);
    });

    it('should extract name from filename', async () => {
      const compiler = createCompiler({ babelTransform });
      const code = `export default { render(h) { return <div /> } }`;
      const result = await compiler.compileJSX(code, 'MyButton.jsx');

      expect(result.name).toBe('MyButton');
    });

    it('should handle compile error gracefully', async () => {
      const failTransform = () => { throw new Error('fail'); };
      const compiler = createCompiler({ babelTransform: failTransform });
      const result = await compiler.compileJSX('const x = <div />', 'fail.jsx');

      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe('compileToCommonJS', () => {
    it('should compile SFC to CommonJS format', async () => {
      const compiler = createCompiler({ babelTransform });
      const code = `
<template><div>CJS</div></template>
<script>export default { name: 'CJS' }</script>`;
      const result = await compiler.compileToCommonJS(code, 'CJS');

      expect(result.errors).toHaveLength(0);
      expect(result.name).toBe('CJS');
      // CommonJS output should not have ESM import/export
      expect(result.js).not.toContain('import ');
    });
  });

  describe('compileToUMD', () => {
    it('should compile SFC to UMD format', async () => {
      const compiler = createCompiler({ babelTransform });
      const code = `
<template><div>UMD</div></template>
<script>export default { name: 'UMDComp' }</script>`;
      const result = await compiler.compileToUMD(code, 'UMDComp');

      expect(result.errors).toHaveLength(0);
      expect(result.name).toBe('UMDComp');
      expect(result.code).toContain('typeof define');
      expect(result.code).toContain('UMDComp');
    });
  });
});

// --- attachTemplateString ---

describe('attachTemplateString', () => {
  it('should generate template assignment code', () => {
    const descriptor = parseSFC(
      '<template><div>Hello</div></template><script>export default {}</script>',
      'test.vue'
    );
    const result = attachTemplateString(descriptor);

    expect(result).toContain('__sfc__.template');
    expect(result).toContain('<div>Hello</div>');
  });

  it('should return empty string if no template', () => {
    const descriptor = parseSFC(
      '<script>export default {}</script>',
      'test.vue'
    );
    const result = attachTemplateString(descriptor);

    expect(result).toBe('');
  });

  it('should escape backticks in template', () => {
    const descriptor = parseSFC(
      '<template><div>`escaped`</div></template><script>export default {}</script>',
      'test.vue'
    );
    const result = attachTemplateString(descriptor);

    expect(result).toContain('\\`escaped\\`');
  });
});

// --- compileStyleBlocks ---

describe('compileStyleBlocks', () => {
  it('should return empty string for no styles', async () => {
    const descriptor = parseSFC('<template><div /></template>', 'test.vue');
    const result = await compileStyleBlocks(descriptor);

    expect(result).toBe('');
  });

  it('should compile plain CSS', async () => {
    const descriptor = parseSFC(
      '<template><div /></template><style>.box { color: red; }</style>',
      'test.vue'
    );
    const result = await compileStyleBlocks(descriptor);

    expect(result).toContain('.box');
    expect(result).toContain('color: red');
  });

  it('should apply scoped styles with scopeId', async () => {
    const descriptor = parseSFC(
      '<template><div /></template><style scoped>.item { color: blue; }</style>',
      'test.vue'
    );
    const scopeId = 'data-v-test123';
    const result = await compileStyleBlocks(descriptor, { scopeId });

    expect(result).toContain(scopeId);
  });

  it('should call style preprocessor for less', async () => {
    const descriptor = parseSFC(
      '<template><div /></template><style lang="less">.parent { .child { color: red; } }</style>',
      'test.vue'
    );
    const lessPreprocessor = vi.fn().mockResolvedValue('.parent .child { color: red; }');

    const result = await compileStyleBlocks(descriptor, {
      preprocessors: { less: lessPreprocessor },
    });

    expect(lessPreprocessor).toHaveBeenCalled();
    expect(result).toContain('.parent .child');
  });
});

// --- generateStyleInjection ---

describe('generateStyleInjection', () => {
  it('should return empty string for empty CSS', () => {
    expect(generateStyleInjection('')).toBe('');
  });

  it('should generate script to inject styles', () => {
    const result = generateStyleInjection('.box { color: red; }');

    expect(result).toContain('document.createElement');
    expect(result).toContain('document.head.appendChild');
    expect(result).toContain('.box');
  });
});
