import { defineConfig } from '@rslib/core';

/**
 * Rslib 构建配置：bundleless + ESM + dts。
 *
 * - bundle: false —— 保持上游 unbundle 语义，依赖不打包，由消费方 bundler 解析
 * - 单入口 `./src/index.ts`：bundleless 模式会按依赖图逐文件产出（含 `dist/date/*`），
 *   `./date` 子路径出口直接复用同一份产物，不会把主入口其余模块拉进依赖图
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
