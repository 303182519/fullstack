import type { ComponentProps } from 'react';
import { cn } from '@fedstack/utils';

interface Props extends ComponentProps<'div'> {
  inverted?: boolean;
}

/**
 * 暗色模式容器：默认使用容器背景 + 基准文字色，带 300ms 过渡。
 *
 * - `inverted` 为 true 时切换为 `bg-inverted` + 硬编码 #1f1f1f 文字色，
 *   适用于 header / sider 等反色区块的内部面板。
 * - 颜色值由 UnoCSS 预设映射到 CSS 变量，主题切换通过变量生效。
 */
function DarkModeContainer({ children, className, inverted, ...rest }: Props) {
  return (
    <div
      className={cn(
        'bg-container text-base-text transition-300',
        { 'bg-inverted text-#1f1f1f': inverted },
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
}

export default DarkModeContainer;
