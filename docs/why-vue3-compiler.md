# 为什么使用 Vue 3 的 @vue/compiler-sfc

本文档解释 vue2-sfc-compiler 为什么选择使用 Vue 3 的 `@vue/compiler-sfc`（v3.5+）而不是 Vue 2.7 的版本。

## 结论先行

| 特性 | Vue 2.7 compiler-sfc | Vue 3 compiler-sfc |
|------|---------------------|-------------------|
| **浏览器支持** | ❌ 不支持 | ✅ 支持 |
| **模块格式** | 仅 CommonJS | ESM + CJS + ESM Browser |
| **Node.js API** | 使用 `path`、`url` 等 | 无依赖，浏览器安全 |
| **依赖数量** | 40+ 可选依赖 (consolidate.js) | 极少依赖 |
| **编译输出兼容性** | - | ✅ 兼容 Vue 2.7 运行时 |

**Vue 3 的 compiler-sfc 编译输出完全兼容 Vue 2.7 运行时，这也是 Vue 官方 [SFC Playground](https://sfc.vuejs.org/) 采用的方案。**

---

## 问题：Vue 2.7 compiler-sfc 无法在浏览器运行

### 1. Node.js API 依赖

Vue 2.7 的 `@vue/compiler-sfc` 源码中直接使用了 Node.js 专用 API：

```typescript
// Vue 2.7 compiler-sfc 源码
import { resolve } from 'path'      // Node.js 内置模块
import { URL } from 'url'           // Node.js 内置模块
import { SourceMapGenerator } from 'source-map'
```

浏览器环境没有这些模块，打包时会报错：

```
[vite] Cannot resolve 'path'
[vite] Cannot resolve 'url'
```

### 2. consolidate.js 模板引擎依赖

Vue 2.7 compiler-sfc 依赖 `consolidate.js`，这是一个支持 40+ 模板引擎的库：

```javascript
// consolidate.js 内部
exports.pug = require('pug')
exports.ejs = require('ejs')
exports.jade = require('jade')
exports.haml = require('haml')
exports.handlebars = require('handlebars')
// ... 40+ 模板引擎
```

打包时会尝试 resolve 所有这些依赖：

```
[vite] Cannot resolve 'pug'
[vite] Cannot resolve 'ejs'
[vite] Cannot resolve 'velocityjs'
[vite] Cannot resolve 'liquor'
... (40+ 错误)
```

### 3. 仅提供 CommonJS 格式

Vue 2.7 compiler-sfc 的 package.json：

```json
{
  "main": "dist/compiler-sfc.cjs.js",
  // 没有 browser 或 esm 入口
}
```

而 Vue 3 compiler-sfc 提供专门的浏览器版本：

```json
{
  "main": "dist/compiler-sfc.cjs.js",
  "module": "dist/compiler-sfc.esm-bundler.js",
  "browser": "dist/compiler-sfc.esm-browser.js"  // 浏览器专用
}
```

### 4. 尝试解决但失败

我们尝试过以下方案，都无法完美解决：

**方案 A：添加 Node.js polyfill**
```javascript
// vite.config.js
resolve: {
  alias: {
    'path': 'path-browserify',
    'url': 'url-polyfill'
  }
}
```
结果：`path` 和 `url` 可以 polyfill，但 consolidate.js 的动态 require 无法静态分析。

**方案 B：将所有模板引擎标记为 external**
```javascript
// tsup.config.ts
external: ['pug', 'ejs', 'jade', 'haml', /* 40+ */]
```
结果：可以打包成功，但运行时仍需要 Node.js 环境。

**方案 C：使用 rollup-plugin-node-polyfills**
结果：增加 100KB+ 体积，且部分 API 行为不一致。

---

## 解决方案：使用 Vue 3 的 compiler-sfc

### 为什么可行？

Vue 3 的 `@vue/compiler-sfc` 设计时就考虑了浏览器环境：

1. **无 Node.js API 依赖** - 不使用 `path`、`url`、`fs` 等
2. **无 consolidate.js** - 不支持模板预处理器（pug 等），但这在浏览器 REPL 场景很少需要
3. **提供 ESM Browser 版本** - `dist/compiler-sfc.esm-browser.js`
4. **最小依赖** - 仅依赖 `@vue/shared`、`@vue/compiler-core` 等内部包

### 编译输出兼容性

关键问题：**Vue 3 compiler 的输出能在 Vue 2 运行时执行吗？**

答案是 **可以**，原因如下：

#### 1. script setup 编译输出

Vue 3 的 `compileScript()` 将 `<script setup>` 编译为标准的 Options API：

```vue
<!-- 输入 -->
<script setup>
import { ref } from 'vue'
const msg = ref('Hello')
</script>
```

```javascript
// Vue 3 compiler 输出
export default {
  setup() {
    const msg = ref('Hello')
    return { msg }
  }
}
```

这个输出格式 **Vue 2.7 完全支持**，因为 Vue 2.7 引入了 Composition API。

#### 2. 模板处理策略

我们 **不使用** Vue 3 的 `compileTemplate()` 编译模板，因为 Vue 2 和 Vue 3 的 render 函数格式不同：

```javascript
// Vue 3 render 函数
render() {
  return createVNode('div', null, this.msg)
}

// Vue 2 render 函数
render(h) {
  return h('div', this.msg)
}
```

我们的策略是将模板作为字符串附加到组件，让 Vue 2 运行时在浏览器中编译：

```javascript
// 我们的输出
const __sfc__ = {
  setup() { ... }
}
__sfc__.template = `<div>{{ msg }}</div>`  // Vue 2 运行时编译
export default __sfc__
```

这样所有 Vue 2 的模板语法（包括 filters、v-for 等）都由 Vue 2 运行时处理，保证 100% 兼容。

#### 3. 样式编译

`compileStyle()` 处理 scoped CSS 的方式在 Vue 2 和 Vue 3 中是相同的：

```css
/* 输入 */
<style scoped>
.foo { color: red; }
</style>

/* 输出 */
.foo[data-v-xxxxx] { color: red; }
```

---

## 功能对比

| 功能 | 支持情况 | 说明 |
|------|---------|------|
| `<script setup>` | ✅ | Vue 3 compiler 完美支持 |
| `<script>` (Options API) | ✅ | 标准 ES 模块处理 |
| TypeScript | ✅ | 通过 Babel 处理 |
| JSX/TSX | ✅ | 通过 vue2-jsx-browser 插件 |
| Scoped CSS | ✅ | compileStyle 处理 |
| CSS Modules | ⚠️ | 浏览器 REPL 不支持 |
| Less/SCSS/SASS | ✅ | 通过注入的预处理器 |
| Pug 模板 | ❌ | 需要 consolidate.js，浏览器不支持 |
| filters | ✅ | 模板由 Vue 2 运行时编译 |
| functional 组件 | ✅ | 模板由 Vue 2 运行时编译 |

---

## Vue 2 特性兼容性详解

### 为什么 Vue 3 移除的特性仍然可用？

Vue 3 移除了很多 Vue 2 特性（filters、.sync、.native、$listeners 等），但这**不影响我们的编译**，原因如下：

#### 1. 模板特性 → Vue 2 运行时编译

我们**不使用** Vue 3 的 `compileTemplate()` 编译模板，而是将模板作为字符串传递给 Vue 2 运行时：

```javascript
// 我们的编译输出
__sfc__.template = `
  <div>
    {{ message | capitalize }}           <!-- filters ✅ -->
    <input v-model.sync="value">         <!-- .sync ✅ -->
    <button @click.native="onClick">     <!-- .native ✅ -->
    <slot name="header"></slot>          <!-- 旧 slot 语法 ✅ -->
  </div>
`
```

这些模板特性由 **Vue 2 运行时** 在浏览器中编译和处理，完全兼容。

#### 2. Options API 特性 → 纯 JavaScript

Vue 2 的 Options API 特性（filters、mixins、$listeners 等）是纯 JavaScript 对象属性：

```javascript
// 用户代码
export default {
  filters: {                    // ✅ 纯 JS 对象，编译器不干预
    capitalize(value) {
      return value.toUpperCase()
    }
  },
  mixins: [myMixin],           // ✅ 纯 JS 对象
}
```

Vue 3 的 `compileScript()` 只处理 `<script setup>` 的宏（defineProps 等），对普通 Options API 对象不做任何转换。

#### 3. script setup 中的差异

`<script setup>` 是 Vue 3 引入的语法，Vue 2.7 通过 backport 支持。两者几乎完全一致：

| 功能 | Vue 2.7 | Vue 3 | 状态 |
|------|---------|-------|------|
| defineProps | ✅ | ✅ | 完全一致 |
| defineEmits | ✅ | ✅ | 完全一致 |
| defineExpose | ✅ | ✅ | 完全一致 |
| useSlots | ✅ | ✅ | 完全一致 |
| useAttrs | ✅ | ✅ | 完全一致 |
| defineOptions | ❌ | ✅ | Vue 3.3+ 新增 |
| defineSlots | ❌ | ✅ | Vue 3.3+ 新增 |
| defineModel | ❌ | ✅ | Vue 3.4+ 新增 |

### 真正的限制

| 限制 | 原因 | 解决方案 |
|------|------|----------|
| Pug/Jade 模板 | 需要 consolidate.js | 使用标准 HTML 模板 |
| CSS Modules | 需要构建工具支持 | 使用 scoped CSS |
| `defineOptions` 等新宏 | Vue 3.3+ 新增，Vue 2.7 不支持 | 使用普通 `<script>` 定义 |
| TypeScript 泛型组件 | Vue 3.3+ 新增 | 使用标准 TypeScript |

### 总结

```
Vue 3 compiler-sfc 处理的部分:
├── SFC 解析 (parse) → 纯文本解析，无差异
├── script setup 编译 → Vue 2.7 支持的语法都兼容
└── 样式处理 → scoped CSS 行为一致

Vue 2 运行时处理的部分:
├── 模板编译 → 所有 Vue 2 模板语法都支持
├── filters → ✅
├── .sync/.native 修饰符 → ✅
├── 旧 slot 语法 → ✅
└── functional 组件 → ✅
```

**结论：由于模板交给 Vue 2 运行时编译，Vue 2 的绝大多数特性都完全支持。唯一的限制是 Vue 3.3+ 新增的 script setup 宏，但这些本身 Vue 2.7 就不支持。**

---

## 官方先例

Vue 官方的 [SFC Playground](https://play.vuejs.org/) 采用相同的技术架构：

- 使用 Vue 3 的 `@vue/compiler-sfc` 在浏览器中编译 SFC
- 证明了 Vue 3 compiler-sfc 可以在纯浏览器环境运行
- 我们借鉴了相同的编译策略，只是将运行时换成 Vue 2.7

源码参考：[vuejs/repl](https://github.com/vuejs/repl)

---

## 总结

| 问题 | Vue 2.7 compiler | 我们的方案 |
|------|-----------------|-----------|
| Node.js API | ❌ 无法在浏览器使用 | ✅ Vue 3 compiler 无此问题 |
| consolidate.js | ❌ 40+ 依赖无法打包 | ✅ Vue 3 compiler 无此依赖 |
| 模块格式 | ❌ 仅 CJS | ✅ ESM Browser 可用 |
| 编译输出 | - | ✅ 兼容 Vue 2.7 运行时 |
| 模板兼容 | - | ✅ 交给 Vue 2 运行时编译 |

**使用 Vue 3 的 @vue/compiler-sfc 是在浏览器环境编译 Vue 2 SFC 的最佳（也是唯一可行的）方案。**
