import { react } from '@fedstack/eslint-config/react';

/**
 * 后台壳包（admin shell）的 eslint 配置：antfu 基础 + react 规则集但关闭 JSX 规则。
 * 本包含 JSX 源码（ui / layouts），但样式与 React 规则由各 app 统一约束，故关闭 react 规则集最省事。
 */
const _config = react({
  react: false,
  ignores: [
    '**/dist/**',
    '**/node_modules/**',
  ],
});

// 壳包是 app 的依赖，不允许反向引用 app 侧别名（@/ 与 ~/ 只存在于各 app 的 tsconfig）。
// 一旦壳包 import '@/...'，只有 app 构建能过、壳包自身 typecheck/build 必红。
_config.append({
  rules: {
    'no-restricted-imports': ['error', {
      patterns: [{
        group: ['@/*', '~/*'],
        message: '壳包禁止引用应用侧别名；请用 @fedstack/* 公共包或 @shell/* 相对域路径。',
      }],
    }],
  },
});

export default _config;
