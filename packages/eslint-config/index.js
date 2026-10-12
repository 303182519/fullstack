import antfu from '@antfu/eslint-config'

// 基础配置：库模式（最严格），适用于 packages/* 与根目录配置文件
export function base(options = {}) {
  return antfu({
    type: 'lib',
    typescript: true,
    vue: false,
    unocss: false,
    astro: false,
    formatters: { css: true, html: true, markdown: true, yaml: true },
    stylistic: { indent: 2, quotes: 'single', semi: false },
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/coverage/**',
      '**/.turbo/**',
      '**/.cache/**',
      '**/pnpm-lock.yaml',
      '**/generated/**',
      '**/routeTree.gen.ts',
    ],
    ...options,
  })
}

export default base
