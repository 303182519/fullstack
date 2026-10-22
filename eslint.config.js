import { base } from '@fedstack/eslint-config';

// 根配置：仅负责 packages/* 与根级配置文件本身
// apps/* 下各应用自带 eslint.config.js（react() / node()），由 turbo run lint 触发
export default base({
  ignores: ['apps/**', 'packages/redis/**', 'packages/health/**', 'scripts/**'],
});
