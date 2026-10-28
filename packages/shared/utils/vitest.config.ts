import { baseTestConfig, defineConfig } from '@fedstack/config/vitest';

// @fedstack/utils 测试配置：共享基础配置来自 @fedstack/config/vitest
// `__tests__/*.test-d.ts` 通过 expectTypeOf 校验类型契约，故开启 typecheck 模式。
export default defineConfig({
  test: {
    ...baseTestConfig,
    typecheck: {
      enabled: true,
      include: ['__tests__/**/*.test-d.ts'],
      tsconfig: './tsconfig.test.json',
    },
  },
});
