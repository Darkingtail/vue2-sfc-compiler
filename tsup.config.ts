import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  sourcemap: true,
  splitting: false,
  treeshake: true,
  // Bundle vue2-jsx-browser for convenience
  noExternal: ['vue2-jsx-browser'],
  esbuildOptions(options) {
    // WORKAROUND: @vue/compiler-dom browser compatibility issue
    // Problem: @vue/compiler-dom's package.json exports "import" -> "esm-bundler.js"
    //          which calls `document.createElement()` at module load time.
    //          This fails in non-browser environments or Web Workers.
    // Error: "ReferenceError: document is not defined" in compiler-dom.esm-bundler.js
    // Solution: Force use of esm-browser.js which handles missing document gracefully.
    // TODO: Report to Vue core team to add "browser" condition in exports
    options.alias = {
      '@vue/compiler-dom': '@vue/compiler-dom/dist/compiler-dom.esm-browser.js',
    }
  },
})
