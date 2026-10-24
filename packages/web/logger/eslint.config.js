import { react } from '@fedstack/eslint-config/react';

/**
 * Web 层 logger 库的 eslint 配置：antfu 基础 + react 规则集但关闭 JSX。
 * logger 是纯运行时库，不使用 JSX/React，但复用 react.js 的 antfu 基础配置最省事。
 */
export default react({
  react: false,
  ignores: [
    '**/dist/**',
    '**/node_modules/**',
  ],
});
