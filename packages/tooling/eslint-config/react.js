import antfu from '@antfu/eslint-config'

// React 应用配置（apps/web 等）：启用 react 支持
export function react(options = {}) {
  return antfu({
    type: 'app',
    typescript: true,
    react: true,
    vue: false,
    unocss: false,
    astro: false,
    formatters: true,
    stylistic: { indent: 2, quotes: 'single', semi: true, endOfLine: 'lf' },
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/.turbo/**',
      '**/routeTree.gen.ts',
    ],
    ...options,
  })
}

export default react
