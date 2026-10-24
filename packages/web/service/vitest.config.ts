import { baseTestConfig, defineConfig } from '@fedstack/config/vitest';

// @fedstack/service 测试配置：共享基础配置来自 @fedstack/config/vitest
// （node 环境 + 包根 __tests__/ 收口；crypto 用例用 node 自带的 WebCrypto 验解密回路）
export default defineConfig({
  test: {
    ...baseTestConfig,
  },
});
