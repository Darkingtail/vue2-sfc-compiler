/**
 * semantic-release 配置
 *
 * 工作流程：
 * 1. 分析 git commits，根据 conventional commits 规范决定版本号
 * 2. 更新 package.json 中的 version
 * 3. 生成 CHANGELOG / Release Notes
 * 4. 发布到 npm
 * 5. 创建 GitHub Release 和 git tag
 *
 * Commit 规范 → 版本号变化：
 * - fix: xxx        → patch (0.1.0 → 0.1.1)
 * - feat: xxx       → minor (0.1.0 → 0.2.0)
 * - feat!: xxx      → major (0.1.0 → 1.0.0)
 * - BREAKING CHANGE → major
 *
 * 其他 commit 类型（不触发发布）：
 * - chore: 杂项
 * - docs: 文档
 * - style: 格式
 * - refactor: 重构
 * - test: 测试
 * - ci: CI 配置
 */
module.exports = {
  branches: ['main'],
  plugins: [
    // 分析 commits，决定是否需要发布及版本号
    '@semantic-release/commit-analyzer',

    // 生成 Release Notes
    '@semantic-release/release-notes-generator',

    // 发布到 npm（会自动更新 package.json 版本号）
    '@semantic-release/npm',

    // 创建 GitHub Release
    '@semantic-release/github',
  ],
}
