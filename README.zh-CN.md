# vue2-sfc-compiler

Vue 2 单文件组件（SFC）编译器，支持 `<script setup>`、TypeScript、JSX 和样式预处理器。

## 作用与目的

将 Vue 2 SFC 源码编译为可执行的 JavaScript 和 CSS。核心能力：

- **解析 SFC**：拆分 `<template>`、`<script>`、`<style>` 块
- **编译 Script**：支持 `<script setup>`、TypeScript、JSX
- **处理模板**：将模板附加为字符串，由 Vue 运行时编译
- **编译样式**：支持 scoped CSS、Less、SCSS/SASS
- **输出格式**：CommonJS（默认）或 UMD

本包是环境无关的纯编译器，通过依赖注入支持 Node.js 和浏览器环境。

## 包结构

```
vue2-sfc-compiler/
├── src/
│   ├── index.ts              # 入口，导出 createCompiler 等
│   ├── types.ts              # 类型定义
│   ├── parser.ts             # SFC 解析器
│   ├── compiler/             # 编译器模块
│   │   ├── index.ts          # 编译器入口
│   │   ├── script.ts         # Script 块编译
│   │   ├── template.ts       # Template 块处理
│   │   └── style.ts          # Style 块编译
│   └── transform/            # 代码转换
│       ├── index.ts          # 转换入口
│       └── umd.ts            # UMD 格式转换
├── dist/                     # 构建产物
├── package.json
└── tsup.config.ts
```

## 文件说明

| 文件/目录 | 作用 |
|-----------|------|
| `index.ts` | 包入口，导出 `createCompiler`、`parseSFC`、`toUMD` 等 |
| `types.ts` | TypeScript 类型定义（Compiler、CompileResult 等） |
| `parser.ts` | 使用 `@vue/compiler-sfc` 解析 SFC，生成 SFCDescriptor |
| `compiler/script.ts` | 编译 `<script>` 和 `<script setup>`，处理 JSX/TS |
| `compiler/template.ts` | 将 template 内容附加到组件对象 |
| `compiler/style.ts` | 编译样式，处理 scoped、预处理器 |
| `transform/umd.ts` | 将 CommonJS 模块转换为 UMD 格式 |

## 使用场景

- **在线编辑器**：实时编译用户输入的 SFC 代码
- **构建工具插件**：自定义 Vue 2 SFC 编译流程
- **代码生成**：将 SFC 编译为可独立运行的模块

## 使用方法

### 1. 创建编译器

编译器需要注入 Babel 转换函数，以支持不同环境：

```javascript
import { createCompiler } from 'vue2-sfc-compiler'

// 浏览器环境（需先加载 @babel/standalone）
const compiler = createCompiler({
  babelTransform: (code, options) => Babel.transform(code, options).code,
})

// Node.js 环境
import { transformSync } from '@babel/core'
const compiler = createCompiler({
  babelTransform: (code, options) => transformSync(code, options)?.code || '',
})
```

### 2. 编译 SFC

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

// name 参数：组件名，用于 Vue devtools、scoped CSS ID、UMD 全局变量
const result = await compiler.compileSFC(sfcCode, 'MyComponent')

console.log(result.js)      // 编译后的 JavaScript
console.log(result.css)     // 编译后的 CSS（含 scoped 处理）
console.log(result.errors)  // 编译错误数组
console.log(result.name)    // 组件名 "MyComponent"
```

### 3. 一步生成 UMD（推荐）

```javascript
// 高级 API：直接从 SFC 生成完整 UMD 组件
const result = await compiler.compileToUMD(sfcCode, 'MyButton')

// 检查编译错误
if (result.errors.length > 0) {
  console.error('编译错误:', result.errors)
}

// result.code - UMD 代码
// result.name - 组件名
// result.errors - 编译错误数组

// 使用：<script src="my-button.js"></script>
// 导出：window.MyButton
```

### 4. 分步转换为 UMD

```javascript
// 先编译，再转换（适合需要中间结果的场景）
const result = await compiler.compileSFC(sfcCode, 'MyButton')
const umdCode = compiler.toUMD(result, {
  externals: { 'element-ui': 'ELEMENT' }
})
```

UMD 产物是**完整的组件**，包含：
- ✅ JavaScript 组件逻辑
- ✅ Template（已编译为字符串附加到组件）
- ✅ CSS（自动注入到 `<head>`，带去重处理）

### 4. 配置样式预处理器

```javascript
const compiler = createCompiler({
  babelTransform: ...,
  stylePreprocessors: {
    less: async (code) => {
      const result = await less.render(code)
      return result.css
    },
    scss: async (code) => {
      // SCSS 处理逻辑
    },
  },
})
```

## 编译流程

### 整体编译链

```
SFC 源码
    │
    ▼
┌──────────────────────────────────┐
│  @vue/compiler-sfc               │  解析 SFC，编译 <script setup>
│  输出: ESM (export default)      │
└──────────────────────────────────┘
    │
    ▼
┌──────────────────────────────────┐
│  vue2-jsx-browser (Babel 插件)   │  转换 JSX 语法
│  输出: h() 函数调用              │  <div>Hi</div> → h('div', 'Hi')
└──────────────────────────────────┘
    │
    ▼
┌──────────────────────────────────┐
│  compileSFC                      │  组合以上步骤 + 样式处理
│  输出: ESM + CSS                 │  CompileResult { js, css, errors, name }
└──────────────────────────────────┘
    │
    ▼
┌──────────────────────────────────┐
│  toUMD / compileToUMD            │  包装为 UMD 格式
│  输出: UMD + CSS 自动注入        │  (function(global, factory){...})
└──────────────────────────────────┘
```

### compileSFC 内部流程

```
SFC 源码
    │
    ▼
┌─────────────┐
│   parser    │  解析为 SFCDescriptor（使用 @vue/compiler-sfc）
└─────────────┘
    │
    ▼
┌─────────────┐
│   script    │  编译 <script> / <script setup>，处理 JSX/TS
└─────────────┘
    │
    ▼
┌─────────────┐
│  template   │  附加模板字符串到组件（运行时编译）
└─────────────┘
    │
    ▼
┌─────────────┐
│   style     │  编译样式，处理 scoped、Less/SCSS
└─────────────┘
    │
    ▼
CompileResult { js, css, errors, name }
```

## 依赖关系

### 内置依赖（已打包）

| 依赖 | 作用 |
|------|------|
| `@vue/compiler-sfc` | 解析 SFC，编译 `<script setup>` |
| `vue2-jsx-browser` | JSX 语法转换（Babel 插件） |

### 注入依赖（用户提供）

| 依赖 | 注入方式 | 作用 |
|------|----------|------|
| Babel | `babelTransform` | 代码转换引擎（必需） |
| TypeScript preset | Babel preset | 编译 TS/TSX |
| Less/SCSS | `stylePreprocessors` | 样式预处理（可选） |

#### Node.js 环境

```bash
# 安装依赖
npm install @babel/core @babel/preset-typescript  # 必需
npm install less sass                              # 可选
```

```typescript
import { createCompiler } from 'vue2-sfc-compiler'
import { transformSync } from '@babel/core'
import less from 'less'        // 可选
import * as sass from 'sass'   // 可选

const compiler = createCompiler({
  // Babel 转换（必需）
  // Node.js 需要显式添加 TypeScript preset
  babelTransform: (code, options) => {
    const result = transformSync(code, {
      ...options,
      presets: [
        ...(options.presets || []),
        ['@babel/preset-typescript', { isTSX: true, allExtensions: true }],
      ],
    })
    return result?.code || ''
  },

  // 样式预处理器（可选）
  stylePreprocessors: {
    less: async (code) => {
      const result = await less.render(code)
      return result.css
    },
    scss: (code) => {
      const result = sass.compileString(code)
      return result.css
    },
    sass: (code) => {
      const result = sass.compileString(code, { syntax: 'indented' })
      return result.css
    },
  },
})
```

#### 浏览器环境

```html
<!-- Babel standalone（必需），内置 TypeScript preset -->
<script src="https://cdn.jsdelivr.net/npm/@babel/standalone@7/babel.min.js"></script>

<!-- Less（可选） -->
<script src="https://cdn.jsdelivr.net/npm/less@4"></script>

<!-- Sass（可选），浏览器端较复杂，建议使用 Less -->
<script src="https://cdn.jsdelivr.net/npm/sass.js@0.11.1/dist/sass.sync.js"></script>
```

```typescript
import { createCompiler } from 'vue2-sfc-compiler'

// 类型声明
declare const Babel: { transform: (code: string, options: unknown) => { code: string } }
declare const less: { render: (code: string) => Promise<{ css: string }> }
declare const Sass: { compile: (code: string) => string }

const compiler = createCompiler({
  // Babel 转换（必需）
  // @babel/standalone 内置 TypeScript preset，无需额外配置
  babelTransform: (code, options) => {
    return Babel.transform(code, options).code
  },

  // 样式预处理器（可选）
  stylePreprocessors: {
    less: async (code) => {
      const result = await less.render(code)
      return result.css
    },
    scss: (code) => {
      return Sass.compile(code)
    },
  },
})
```
