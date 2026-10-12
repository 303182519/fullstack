import antfu from '@antfu/eslint-config'

// Node.js / NestJS 后端配置：放宽装饰器与 DI 相关规则
export function node(options = {}) {
  return antfu({
    type: 'app',
    typescript: true,
    vue: false,
    unocss: false,
    astro: false,
    formatters: true,
    stylistic: { indent: 2, quotes: 'single', semi: false },
    overrides: {
      typescript: {
        // NestJS 大量使用 class 形式定义 DTO / Controller / Provider
        'ts/consistent-type-definitions': 'off',
        // 后端允许 console（推荐改用 NestJS Logger）
        'no-console': 'off',
      },
    },
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/.turbo/**',
      '**/generated/**',
    ],
    ...options,
  })
}

export default node
