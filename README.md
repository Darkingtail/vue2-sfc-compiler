# vue2-sfc-compiler

[中文文档](./README.zh-CN.md)

Vue 2 Single File Component (SFC) compiler with `<script setup>`, TypeScript, JSX and style preprocessor support.

## Purpose

Compile Vue 2 SFC source code to executable JavaScript and CSS. Core capabilities:

- **Parse SFC**: Split `<template>`, `<script>`, `<style>` blocks
- **Compile Script**: Support `<script setup>`, TypeScript, JSX
- **Process Template**: Attach template as string for Vue runtime compilation
- **Compile Styles**: Support scoped CSS, Less, SCSS/SASS
- **Output Formats**: CommonJS (default) or UMD

This package is environment-agnostic, supporting both Node.js and browser environments through dependency injection.

## Package Structure

```
vue2-sfc-compiler/
├── src/
│   ├── index.ts              # Entry, exports createCompiler etc.
│   ├── types.ts              # Type definitions
│   ├── parser.ts             # SFC parser
│   ├── compiler/             # Compiler modules
│   │   ├── index.ts          # Compiler entry
│   │   ├── script.ts         # Script block compilation
│   │   ├── template.ts       # Template block processing
│   │   └── style.ts          # Style block compilation
│   └── transform/            # Code transformation
│       ├── index.ts          # Transform entry
│       └── umd.ts            # UMD format transformation
├── dist/                     # Build output
├── package.json
└── tsup.config.ts
```

## Use Cases

- **Online Editors**: Real-time compilation of user-written SFC code
- **Build Tool Plugins**: Custom Vue 2 SFC compilation workflows
- **Code Generation**: Compile SFC to standalone runnable modules

## Usage

### 1. Create Compiler

The compiler requires a Babel transform function injection to support different environments:

```javascript
import { createCompiler } from 'vue2-sfc-compiler'

// Browser environment (requires @babel/standalone loaded first)
const compiler = createCompiler({
  babelTransform: (code, options) => Babel.transform(code, options).code,
})

// Node.js environment
import { transformSync } from '@babel/core'
const compiler = createCompiler({
  babelTransform: (code, options) => transformSync(code, options)?.code || '',
})
```

### 2. Compile SFC

```javascript
const sfcCode = `
<template>
  <div>{{ msg }}</div>
</template>

<script setup>
import { ref } from 'vue'
const msg = ref('Hello')
</script>

<style scoped>
div { color: red; }
</style>
`

// name parameter: component name, used for Vue devtools, scoped CSS ID, UMD global
const result = await compiler.compileSFC(sfcCode, 'MyComponent')

console.log(result.js)      // Compiled JavaScript
console.log(result.css)     // Compiled CSS (with scoped processing)
console.log(result.errors)  // Compilation errors array
console.log(result.name)    // Component name "MyComponent"
```

### 3. Generate UMD in One Step (Recommended)

```javascript
// High-level API: Generate complete UMD component from SFC
const result = await compiler.compileToUMD(sfcCode, 'MyButton')

// Check for compilation errors
if (result.errors.length > 0) {
  console.error('Compilation errors:', result.errors)
}

// result.code - UMD code
// result.name - Component name
// result.errors - Compilation errors array

// Usage: <script src="my-button.js"></script>
// Export: window.MyButton
```

### 4. Configure Style Preprocessors

```javascript
const compiler = createCompiler({
  babelTransform: ...,
  stylePreprocessors: {
    less: async (code) => {
      const result = await less.render(code)
      return result.css
    },
    scss: async (code) => {
      // SCSS processing logic
    },
  },
})
```

## Compilation Pipeline

```
SFC Source
    │
    ▼
┌──────────────────────────────────┐
│  @vue/compiler-sfc               │  Parse SFC, compile <script setup>
│  Output: ESM (export default)    │
└──────────────────────────────────┘
    │
    ▼
┌──────────────────────────────────┐
│  vue2-jsx-browser (Babel plugin) │  Transform JSX syntax
│  Output: h() function calls      │  <div>Hi</div> → h('div', 'Hi')
└──────────────────────────────────┘
    │
    ▼
┌──────────────────────────────────┐
│  compileSFC                      │  Combine above steps + style processing
│  Output: ESM + CSS               │  CompileResult { js, css, errors, name }
└──────────────────────────────────┘
    │
    ▼
┌──────────────────────────────────┐
│  toUMD / compileToUMD            │  Wrap as UMD format
│  Output: UMD + CSS auto-inject   │  (function(global, factory){...})
└──────────────────────────────────┘
```

## Dependencies

### Bundled Dependencies

| Dependency | Purpose |
|------------|---------|
| `@vue/compiler-sfc` | Parse SFC, compile `<script setup>` |
| `vue2-jsx-browser` | JSX syntax transformation (Babel plugin) |

### Injected Dependencies (User Provided)

| Dependency | Injection Method | Purpose |
|------------|------------------|---------|
| Babel | `babelTransform` | Code transformation engine (required) |
| TypeScript preset | Babel preset | Compile TS/TSX |
| Less/SCSS | `stylePreprocessors` | Style preprocessing (optional) |

## License

MIT
