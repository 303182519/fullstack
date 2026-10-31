import { defineConfig, presetWind3, transformerDirectives, transformerVariantGroup } from 'unocss';

import { presetAdminTheme } from './uno-preset';

/**
 * UnoCSS 配置（admin 应用是唯一消费方），按 Rsbuild 官方方式经 `@unocss/postcss` 接入。
 *
 * - `important: '.root'` 与 skyroc 一致：生成 `.root :is(.utility)`，提升工具类对 antd
 *   无层 CSS-in-JS 的优先级。因此应用根节点（`static/index.html` 的 `body`）带 `class="root"`。
 * - 内容扫描走 filesystem 显式 glob：app 与壳包（`packages/web/admin/src`）的 ts/tsx。
 */
export default defineConfig({
  content: {
    filesystem: ['./src/**/*.{ts,tsx}', '../../packages/web/admin/src/**/*.{ts,tsx}'],
  },
  presets: [
    presetWind3({
      dark: 'class',
      important: '.root',
      preflight: 'on-demand',
      variablePrefix: '',
    }),
    presetAdminTheme(),
  ],
  transformers: [transformerDirectives(), transformerVariantGroup()],
});
