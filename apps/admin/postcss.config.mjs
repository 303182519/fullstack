import UnoCSS from '@unocss/postcss';

/**
 * UnoCSS 经 Rsbuild 内置 PostCSS 管线接入（见 https://rsbuild.rs/zh/guide/styling/unocss）。
 * 配置真源为 apps/admin/uno.config.ts；CSS 侧的引入指令在壳包 styles/global.css。
 */
export default {
  plugins: [UnoCSS()],
};
