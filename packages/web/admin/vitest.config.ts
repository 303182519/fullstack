import { baseTestConfig, defineConfig } from '@fedstack/config/vitest';

// @fedstack/web-admin-shell 测试配置：当前只有布局域纯函数单测，无 DOM 需求，沿用共享 node 环境。
export default defineConfig({
  test: {
    ...baseTestConfig,
  },
});
