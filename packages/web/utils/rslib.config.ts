import { defineConfig } from '@rslib/core';

/**
 * Rslib 构建配置：bundleless + ESM + dts（与 web 层其它库一致）。
 *
 * bundleless 模式保留 import 语句，`@fedstack/utils` / `react` / `localforage`
 * 由消费方 bundler 解析；react 为 peer 依赖。
 */
export default defineConfig({
  lib: [
    {
      format: 'esm',
      bundle: false,
      dts: true,
    },
  ],
});
