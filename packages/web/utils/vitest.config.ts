import { baseTestConfig, defineConfig } from '@fedstack/config/vitest';

// @fedstack/web-utils 测试配置：被测代码直接操作 document / window / localStorage，
// 故覆盖共享基础配置的 node 环境为 happy-dom。
export default defineConfig({
  test: {
    ...baseTestConfig,
    environment: 'happy-dom',
    typecheck: {
      enabled: true,
      include: ['__tests__/**/*.test-d.ts'],
      tsconfig: './tsconfig.test.json',
    },
  },
});
