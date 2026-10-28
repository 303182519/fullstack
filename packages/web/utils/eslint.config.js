import { base } from '@fedstack/eslint-config';

/**
 * web 层工具包 eslint 配置：antfu 基础库规则。
 *
 * compose-props 只调用 React API（cloneElement），不写 JSX，故不启用 react 规则集。
 */
export default base({
  ignores: ['**/dist/**', '**/node_modules/**', '**/.turbo/**'],
});
