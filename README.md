# vue2-sfc-compiler

[中文文档](./README.zh-CN.md)

Vue 2 Single File Component (SFC) compiler with `<script setup>`, TypeScript, JSX and style preprocessor support.

> **Acknowledgments**: This project is built on top of [`@vue/compiler-sfc`](https://github.com/vuejs/core/tree/main/packages/compiler-sfc) by the Vue.js team. Thanks to the Vue team for providing excellent SFC compilation infrastructure that makes browser-based Vue 2 SFC compilation possible.

## Purpose

Compile Vue 2 SFC source code to executable JavaScript and CSS. Core capabilities:

- **Parse SFC**: Split `<template>`, `<script>`, `<style>` blocks
- **Compile Script**: Support `<script setup>`, TypeScript, JSX
- **Process Template**: Attach template as string for Vue runtime compilation
- **Compile Styles**: Support scoped CSS, Less, SCSS/SASS
- **Output Formats**: ESM, CommonJS, or UMD

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

### 3. Compile to CommonJS (For Sandbox Execution)

```javascript
// Compile SFC to CommonJS format for sandbox/iframe execution
const result = await compiler.compileToCommonJS(sfcCode, 'MyComponent')

if (result.errors.length === 0) {
  // Execute in sandbox with custom require()
  const module = { exports: {} }
  const require = (id) => {
    if (id === 'vue') return Vue
    // ... handle other dependencies
  }
  new Function('require', 'module', 'exports', result.js)(require, module, module.exports)
  const Component = module.exports.default
}

// result.js - CommonJS code
// result.css - Compiled CSS
// result.errors - Compilation errors
```

### 4. Generate UMD (For Script Tag Loading)

```javascript
// High-level API: Generate complete UMD component from SFC
const result = await compiler.compileToUMD(sfcCode, 'MyButton')

// Check for compilation errors
if (result.errors.length > 0) {
  console.error('Compilation errors:', result.errors)
}

// result.code - UMD code (with CSS auto-injection)
// result.name - Component name
// result.errors - Compilation errors array

// Usage: <script src="my-button.js"></script>
// Export: window.MyButton
```

### 5. Configure Style Preprocessors

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
    ├─────────────────────────────────┐
    ▼                                 ▼
┌─────────────────────┐    ┌─────────────────────────┐
│  compileToCommonJS  │    │  compileToUMD           │
│  Output: CJS + CSS  │    │  Output: UMD + CSS      │
│  (for sandbox)      │    │  (for script tag)       │
└─────────────────────┘    └─────────────────────────┘
```

### Output Formats

| Method | Format | Use Case |
|--------|--------|----------|
| `compileSFC` | ESM | Build tools, bundlers |
| `compileToCommonJS` | CommonJS | Sandbox/iframe execution |
| `compileToUMD` | UMD | Script tag loading |

## Dependencies

### Bundled Dependencies

| Dependency | Purpose |
|------------|---------|
| `@vue/compiler-sfc` | Parse SFC, compile `<script setup>` |
| `vue2-jsx-browser` | JSX syntax transformation (Babel plugin) |

### Why Vue 3's @vue/compiler-sfc?

This package uses **Vue 3's `@vue/compiler-sfc`** (v3.5+) instead of Vue 2.7's version because Vue 2.7's compiler-sfc **cannot run in browsers**:

| | Vue 2.7 compiler-sfc | Vue 3 compiler-sfc |
|---|---|---|
| **Browser Support** | ❌ Node.js only | ✅ Browser compatible |
| **Module Format** | CommonJS only | ESM + CommonJS + ESM Browser |
| **Node.js APIs** | Uses `path`, `url`, etc. | Browser-safe |
| **Dependencies** | 40+ optional deps (consolidate.js) | Minimal deps |

**Key Point**: Vue 3's compiler output is **fully compatible with Vue 2.7 runtime**. We attach templates as strings for Vue 2 runtime compilation, ensuring 100% Vue 2 syntax compatibility.

> **[Read the detailed explanation](./docs/why-vue3-compiler.md)** for technical details and attempted solutions.

### Injected Dependencies (User Provided)

| Dependency | Injection Method | Purpose |
|------------|------------------|---------|
| Babel | `babelTransform` | Code transformation engine (required) |
| TypeScript preset | Babel preset | Compile TS/TSX |
| Less/SCSS | `stylePreprocessors` | Style preprocessing (optional) |

## License

MIT
