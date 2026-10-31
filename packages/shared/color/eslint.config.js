import { base } from '@fedstack/eslint-config';

/**
 * shared 层色彩包 eslint 配置：antfu 基础库规则（不含 React）。
 *
 * 局部放宽两类文件（根配置的 shared 层边界规则针对运行时代码）：
 * - 构建/测试配置：需要引用 tooling 层的 @fedstack/config、@fedstack/tsconfig
 * - __tests__：运行在 node 环境，允许 Node 内置模块
 */
export default base({
  ignores: ['**/dist/**', '**/node_modules/**', '**/.turbo/**'],
}).append(
  {
    name: 'fedstack/color-dev-config-relax',
    files: ['*.config.ts', '__tests__/**/*.ts'],
    rules: {
      'no-restricted-imports': 'off',
    },
  },
);
