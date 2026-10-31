import { baseTestConfig, defineConfig } from '@fedstack/config/vitest';

// @fedstack/color 测试配置：纯函数用例，node 环境即可，无需 DOM
export default defineConfig({
  test: {
    ...baseTestConfig,
  },
});
