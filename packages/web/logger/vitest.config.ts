import { baseTestConfig, defineConfig } from '@fedstack/config/vitest';

// @fedstack/logger 测试配置：共享基础配置来自 @fedstack/config/vitest
// （node 环境 + msw 网络层 mock + fake-indexeddb 模拟 IndexedDB，包根 __tests__/ 收口）
export default defineConfig({
  test: {
    ...baseTestConfig,
  },
});
