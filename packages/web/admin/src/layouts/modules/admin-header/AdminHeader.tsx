import type { FC, ReactNode } from 'react';

import { GLOBAL_HEADER_MENU_ID } from '../../constant';
import { useAdminLayoutSlots } from '../../context';
import Fullscreen from './Fullscreen';
import Logo from './Logo';
import SiderToggle from './SiderToggle';

export interface AdminHeaderProps {
  /** 顶栏模式：vertical（侧栏主导，显示 SiderToggle + Breadcrumb 在 center） / horizontal（顶栏主导，显示顶栏菜单 portal） */
  headerMode?: 'vertical' | 'horizontal';
  /** 是否显示 SiderToggle 折叠按钮（默认 headerMode='horizontal' 时隐藏，因 horizontal 骨架本身无侧栏；hybrid 模式虽用 horizontal headerMode 但有侧栏，需传 true） */
  showSiderToggle?: boolean;
  /** center 区域内容（vertical 模式下通常放 Breadcrumb；horizontal 模式下顶栏菜单 portal 占满 portal 挂载点，center 不再渲染） */
  center?: ReactNode;
}

/**
 * 顶栏布局容器。
 *
 * portal 挂载点（`GLOBAL_HEADER_MENU_ID`）始终在 DOM 里：vertical 模式下它宽度 0（`hidden`），
 * horizontal 模式下它 flex-1 占满中间空间、顶栏菜单 portal 进来。Breadcrumb 与 portal
 * 挂载点互斥，避免二者同时出现挤顶栏。
 *
 * SiderToggle 默认在 headerMode='horizontal' 时隐藏（horizontal 骨架无侧栏）；
 * hybrid 三模式虽然也用 horizontal headerMode，但有侧栏，由装配层显式传 `showSiderToggle`。
 */
const AdminHeader: FC<AdminHeaderProps> = ({ center, headerMode = 'vertical', showSiderToggle }) => {
  const slots = useAdminLayoutSlots();
  const isHorizontal = headerMode === 'horizontal';
  // 默认 horizontal 骨架无侧栏，隐藏 SiderToggle；装配层对 hybrid 模式显式传 showSiderToggle
  const shouldShowSiderToggle = showSiderToggle ?? !isHorizontal;

  return (
    <div className="flex h-full items-center gap-0 bg-surface px-4 text-foreground shadow-sm">
      <Logo />
      {shouldShowSiderToggle && <SiderToggle />}

      {/* 顶栏菜单 portal 挂载点：始终在 DOM 里，显隐由 headerMode 控制 */}
      <div
        className={cn('h-full items-center', isHorizontal ? 'flex flex-1' : 'hidden')}
        id={GLOBAL_HEADER_MENU_ID}
      />

      {/* center 区域：vertical 模式下放 Breadcrumb；horizontal 模式下 portal 挂载点已占满中间 */}
      {!isHorizontal && center && (
        <div className="flex flex-1 items-center">
          {center}
        </div>
      )}

      {slots.headerLeftActions}

      <div className="ml-auto flex items-center gap-1">
        {slots.headerMiddleActions}
        <Fullscreen />
        {slots.headerRightActions}
      </div>
    </div>
  );
};

/** 避免引入 @fedstack/utils 只为一个三元，这里本地内联 */
function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(' ');
}

export default AdminHeader;
