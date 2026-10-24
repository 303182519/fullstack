import { defineConfig } from '@rslib/core';

/**
 * Rslib 构建配置：bundleless + ESM。
 *
 * 关键设计（与 @fedstack/axios 一致）：
 * - bundle: false —— bundleless 模式，逐文件转译并保留目录结构，
 *   dist/index.js、dist/crypto/index.js、dist/query/index.js 三个入口自然生成
 * - format: 'esm' —— 与项目统一 ESM 输出
 * - dts: true —— 生成类型声明文件
 *
 * bundleless 模式下 dependencies 不会被打包（autoExternal 仅 bundle 模式生效），
 * import axios from 'axios'、import forge from 'node-forge' 等语句原样保留，
 * 由消费方打包工具（webpack/vite）自行解析。
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
