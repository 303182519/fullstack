import { defineConfig } from '@rslib/core';

/**
 * Rslib 构建配置：bundleless + ESM。
 *
 * 关键设计（对应迁移决策）：
 * - bundle: false —— bundleless 模式，保留 import 语句不打包 dependencies
 * - format: 'esm' —— 与项目统一 ESM 输出
 * - dts: true —— 生成类型声明文件（与现有 node 层包行为一致）
 *
 * rslib bundleless 模式下 dependencies 不会被打包（autoExternal 仅 bundle 模式生效），
 * 所以消费方 React 应用引用 @fedstack/axios 后，import axios from 'axios' 等语句
 * 会原样保留，webpack/vite 等打包工具会自行解析这些依赖。
 */
export default defineConfig({
  lib: [
    {
      format: 'esm',
      bundle: false,
      dts: true,
    },
  ],
  source: {
    entry: {
      index: ['./src/**', '!src/__tests__/**'],
    },
  },
});
