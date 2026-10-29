import { react } from '@fedstack/eslint-config/react';

// React 前端应用：统一使用 Monorepo 共享配置（含格式化，无需 Prettier）
// TanStack Router 文件路由强制每个 route 文件同时导出 Route 和组件，
// 与 react-refresh/only-export-components 冲突，在 routes 目录禁用。
const _config = react();
_config.overrideRules({
  'react-refresh/only-export-components': 'off',
}, {
  files: ['src/routes/**'],
});

export default _config;
