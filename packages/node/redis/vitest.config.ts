import { baseTestConfig } from '@fedstack/config/vitest';
import { defineConfig } from 'vitest/config';

// @fedstack/redis 测试配置：共享基础配置来自 @fedstack/config/vitest
// （node 环境，包根 __tests__/ 收口）
export default defineConfig({
  test: {
    ...baseTestConfig,
  },
});
