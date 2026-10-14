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
    stylistic: { indent: 2, quotes: 'single', semi: true, endOfLine: 'lf' },
    rules: {
      // 后端允许直接使用全局 process（process.env 等），不强制 import from 'node:process'
      'node/prefer-global/process': 'off',
    },
    overrides: {
      typescript: {
        // NestJS 大量使用 class 形式定义 DTO / Controller / Provider
        'ts/consistent-type-definitions': 'off',
        // 后端允许 console（推荐改用 NestJS Logger）
        'no-console': 'off',
        // DI 依赖 emitDecoratorMetadata 的运行时令牌，自动改成 import type 会破坏注入
        'ts/consistent-type-imports': 'off',
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
