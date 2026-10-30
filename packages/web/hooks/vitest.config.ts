import { baseTestConfig, defineConfig } from '@fedstack/config/vitest';

// @fedstack/hooks 测试配置：hook 直接依赖 window / navigator / document，
// 故覆盖共享基础配置的 node 环境为 happy-dom。
export default defineConfig({
  test: {
    ...baseTestConfig,
    environment: 'happy-dom',
    setupFiles: ['__tests__/setup.ts'],
  },
});
