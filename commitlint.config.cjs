/**
 * Commitlint 配置
 *
 * 规范 commit message 格式：
 * type(scope?): subject
 *
 * 示例：
 * - fix: 修复 xxx
 * - feat: 添加 xxx
 * - feat(compiler): 添加 xxx
 * - chore: 更新依赖
 */
module.exports = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    // type 必须是以下之一
    'type-enum': [
      2,
      'always',
      [
        'feat',     // 新功能
        'fix',      // 修复 bug
        'docs',     // 文档
        'style',    // 格式（不影响代码运行）
        'refactor', // 重构
        'perf',     // 性能优化
        'test',     // 测试
        'build',    // 构建
        'ci',       // CI 配置
        'chore',    // 杂项
        'revert',   // 回滚
      ],
    ],
    // subject 不能为空
    'subject-empty': [2, 'never'],
    // type 不能为空
    'type-empty': [2, 'never'],
  },
}
