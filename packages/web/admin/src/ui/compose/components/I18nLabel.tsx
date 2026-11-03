import type { i18n } from 'i18next';
import type { ReactNode } from 'react';
import { Translation } from 'react-i18next';

interface I18nLabelProps {
  /** 未提供 i18nKey 时展示的兜底内容 */
  readonly fallback?: ReactNode;
  /** 指定 i18n 实例；不传时使用 react-i18next 默认实例 */
  readonly i18n?: i18n;
  /** i18n 翻译 key */
  readonly i18nKey?: string | null;
}

/**
 * i18n 文本标签：提供 i18nKey 时渲染翻译结果，否则渲染 fallback。
 *
 * @example
 * ```tsx
 * <I18nLabel i18nKey="common.confirm" fallback="确认" />
 * ```
 */
function I18nLabel({ fallback, i18n: i18nInstance, i18nKey }: I18nLabelProps) {
  return (
    <Translation i18n={i18nInstance}>
      {t => (i18nKey ? t(i18nKey) : fallback)}
    </Translation>
  );
}

export default I18nLabel;
