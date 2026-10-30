import { base } from '@fedstack/eslint-config';

/**
 * web 层 hooks 包 eslint 配置：antfu 基础库规则。
 *
 * 本包只导出 hook 与类型，不写 JSX，故不启用 react 规则集。
 */
export default base({
  ignores: ['**/dist/**', '**/node_modules/**', '**/.turbo/**'],
});
