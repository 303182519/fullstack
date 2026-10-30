import type { FC, ReactNode } from 'react';

import { useNavigate } from '@tanstack/react-router';

import { SvgIcon } from '../../../ui/compose/components';
import { useAdminLayoutSlots } from '../../context';

export interface LogoProps {
  /** Logo 区域宽度（通常等于 sider 宽度；vertical 模式下顶栏 Logo 收起不占位，调用方可不传） */
  width?: number;
}

/**
 * 顶栏品牌区：Logo 图标 + 可选标题 + 跳转。
 *
 * 渲染优先级（与 context.tsx 的插槽契约对齐）：
 * 1. slots.logo：应用侧直接传入的 ReactNode（完全接管）；
 * 2. slots.logoTitle：默认图标 + 传入标题；
 * 3. 都没传时，显示默认图标（Material Design Icons 集 `mdi:shield-account`）
 *    + 默认标题（"Fedstack Admin"）。
 *
 * 图标通过 `SvgIcon` 渲染，底层为 @iconify/react + 本地注册的 mdi 图标集
 * （见 `ui/compose/components/SvgIcon.tsx`），不会发起在线请求。
 *
 * 跳转目标默认 `/home`，应用侧可通过 slots.logoTo 覆盖。
 */
const Logo: FC<LogoProps> = ({ width }) => {
  const navigate = useNavigate();
  const { logo, logoTitle, logoTo } = useAdminLayoutSlots();

  const handleClick = () => {
    const target = logoTo ?? '/home';
    void navigate({ to: target as never });
  };

  const style = width !== undefined ? { width } : undefined;

  let content: ReactNode;
  if (logo) {
    content = logo;
  }
  else {
    content = (
      <button
        type="button"
        className="inline-flex cursor-pointer items-center gap-2 whitespace-nowrap"
        onClick={handleClick}
      >
        <span
          aria-hidden
          className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-primary text-surface"
        >
          <SvgIcon
            icon="mdi:shield-account"
            className="text-lg"
          />
        </span>
        <span className="text-base font-semibold text-foreground">
          {logoTitle ?? 'Fedstack Admin'}
        </span>
      </button>
    );
  }

  return (
    <div
      className="flex h-full shrink-0 items-center"
      style={style}
    >
      {content}
    </div>
  );
};

export default Logo;
