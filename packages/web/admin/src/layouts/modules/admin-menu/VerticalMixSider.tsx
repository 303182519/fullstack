import type { FC } from 'react';

import { layoutSettings } from '../../config/layout-settings';
import { GLOBAL_SIDER_FIRST_LEVEL_ID, GLOBAL_SIDER_MENU_ID } from '../../constant';
import { useLayoutStore } from '../../store/layout';

export interface VerticalMixSiderProps {
  /** 当前激活的一级菜单是否有子级（决定右栏是否显示 mixChildMenuWidth） */
  hasChildren?: boolean;
}

/**
 * vertical-mix 模式的双栏侧栏容器。
 *
 * 左栏（一级菜单）：宽度 mixWidth / mixCollapsedWidth，portal 目标 GLOBAL_SIDER_FIRST_LEVEL_ID。
 * 右栏（二级子菜单）：宽度 mixChildMenuWidth，portal 目标 GLOBAL_SIDER_MENU_ID；
 * mixSiderFixed 关闭或当前一级菜单无子级时宽度 0（隐藏）。
 *
 * 本组件只渲染 portal 挂载点 DOM，菜单实例由装配层的两个 AdminMenu（children 里）portal 进来。
 * materials 骨架负责把整个 aside 摆到正确位置（left: 0, top: 0, width: mixWidth + mixChildMenuWidth）。
 */
const VerticalMixSider: FC<VerticalMixSiderProps> = ({ hasChildren = false }) => {
  const siderCollapse = useLayoutStore(state => state.siderCollapse);
  const mixSiderFixed = useLayoutStore(state => state.mixSiderFixed);

  const { mixChildMenuWidth, mixCollapsedWidth, mixWidth } = layoutSettings.sider;
  const leftWidth = siderCollapse ? mixCollapsedWidth : mixWidth;

  // 右栏显示条件：mixSiderFixed 开启 && 当前一级菜单有子级
  const showRightBar = mixSiderFixed && hasChildren;
  const rightBarWidth = showRightBar ? mixChildMenuWidth : 0;

  return (
    <div className="flex h-full w-full overflow-hidden bg-surface">
      {/* 左栏：一级菜单（窄栏，只够放图标） */}
      <div
        className="h-full shrink-0 overflow-x-hidden overflow-y-auto"
        id={GLOBAL_SIDER_FIRST_LEVEL_ID}
        style={{ width: leftWidth }}
      />
      {/* 右栏：二级子菜单（固定宽度，无内容时宽度 0 隐藏） */}
      <div
        className="h-full shrink-0 overflow-hidden transition-[width] duration-200"
        id={GLOBAL_SIDER_MENU_ID}
        style={{ width: rightBarWidth }}
      />
    </div>
  );
};

export default VerticalMixSider;
