import { defineConfig } from '@rslib/core';

/**
 * Rslib 构建配置：bundleless + ESM（与 @fedstack/axios 同一模板）。
 *
 * - bundle: false —— bundleless 模式，保留 import 语句不打包 dependencies
 * - format: 'esm' —— 与项目统一 ESM 输出
 * - dts: true —— 生成类型声明文件
 *
 * React Native 的 @react-native-async-storage/async-storage 是 optional peerDependency，
 * 源码中一律动态 import，bundleless 模式下该语句原样保留，Web 端打包工具不会因静态引用报错。
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
