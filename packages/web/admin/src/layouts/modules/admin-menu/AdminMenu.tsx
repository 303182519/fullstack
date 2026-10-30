import type { MenuProps } from 'antd';

import type { AdminMenuItem } from '../../utils/menu-mapper';

import { useLocation, useNavigate } from '@tanstack/react-router';
import { Menu } from 'antd';
import { memo, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';

import { GLOBAL_SIDER_MENU_ID } from '../../constant';
import { useLayoutStore } from '../../store/layout';
import { useMenusStore } from '../../store/menus';
import { findMenuByPath, indexMenusByKey } from '../../utils/menu-mapper';

type AntdMenuItems = NonNullable<MenuProps['items']>;

/** UI 模型树 → antd Menu items（纯字段透传，children 递归） */
function toAntdItems(menus: AdminMenuItem[]): AntdMenuItems {
  return menus.map(({ children, icon, key, label }) => ({
    children: children ? toAntdItems(children) : undefined,
    icon,
    key,
    label,
  }));
}

/** 菜单激活行为：混合模式下点击一级有子级的菜单时，先激活而非直接导航 */
export type AdminMenuSelectBehavior = 'default' | 'activateFirst';

export interface AdminMenuProps {
  /** 菜单 UI 模型树（app 装配层用 `toAdminMenuTree` 映射后端 DTO 后传入；FirstLevel 形态需先剔除 children） */
  menus: AdminMenuItem[];
  /** portal 挂载点 DOM id，默认侧栏挂载点；horizontal/hybrid 模式传顶栏挂载点 */
  containerId?: string;
  /** antd Menu 的渲染形态，默认 inline（侧栏垂直）；horizontal 用于顶栏 */
  menuMode?: 'inline' | 'horizontal';
  /** 点击行为：default=只有 path 非空项导航；activateFirst=一级有 children 时先激活 changeActiveKey，无子级时导航 */
  selectBehavior?: AdminMenuSelectBehavior;
}

/**
 * 菜单组件：支持侧栏 inline / 顶栏 horizontal 两种形态，portal 挂载目标可配。
 *
 * 与 skyroc 设计一致：菜单实例与内容区是兄弟节点，portal 挂载目标（侧栏 / 顶栏）可切换
 * 而不重建菜单 DOM——切换布局模式时展开/高亮状态得以保留。
 *
 * 数据流：菜单树由 props 受控传入（React Query 是事实源）；`openKeys` / `activeKey`
 * 走 `useMenusStore`（手动覆盖态由用户点击写入，路由变化时重置为空由路由派生接管）；
 * 选中态由 `useLocation` + store activeKey 实时派生。
 */
const AdminMenu = memo<AdminMenuProps>(({
  menus,
  containerId = GLOBAL_SIDER_MENU_ID,
  menuMode = 'inline',
  selectBehavior = 'default',
}) => {
  const pathname = useLocation({ select: location => location.pathname });
  const navigate = useNavigate();

  const siderCollapse = useLayoutStore(state => state.siderCollapse);
  const openKeys = useMenusStore(state => state.openKeys);
  const setOpenKeys = useMenusStore(state => state.setOpenKeys);
  const storeActiveKey = useMenusStore(state => state.activeKey);
  const setActiveKey = useMenusStore(state => state.setActiveKey);
  const resetActiveKeys = useMenusStore(state => state.resetActiveKeys);

  // portal 目标由 SiderMenuMount / AdminHeader 渲染，且可能**晚于菜单出现**：
  // 混合模式（top-hybrid-header-first / vertical-hybrid-header-first）的侧栏显隐依赖菜单数据，
  // 首帧菜单未加载 → siderWidth=0 → 挂载点不存在。只解析一次会让 container 永久为 null。
  // 用 MutationObserver 同步挂载点：出现即挂上、被条件渲染移除即置空，避免 portal 向脱离 DOM 的旧容器渲染。
  const [container, setContainer] = useState<HTMLElement | null>(null);
  useLayoutEffect(() => {
    setContainer(document.getElementById(containerId));
    const observer = new MutationObserver(() => {
      setContainer(document.getElementById(containerId));
    });
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [containerId]);

  const menuIndex = useMemo(() => indexMenusByKey(menus), [menus]);
  const items = useMemo(() => toAntdItems(menus), [menus]);
  const isHorizontal = menuMode === 'horizontal';

  const selectedKeys = useMemo(() => {
    const match = findMenuByPath(menus, pathname);
    if (selectBehavior === 'activateFirst') {
      // 顶栏 FirstLevel 形态：高亮当前激活的一级菜单
      // 激活 key = store 手动覆盖 || 路由派生（parents[0] || 当前项自身）
      const activeFirstKey = storeActiveKey
        || match?.parents[0]?.key
        || match?.item.key
        || '';
      return activeFirstKey ? [activeFirstKey] : [];
    }
    // default：高亮匹配到的菜单项（可能是任意深度叶子）
    return match ? [match.item.key] : [];
  }, [menus, pathname, selectBehavior, storeActiveKey]);

  // 手风琴跟随路由：路由变化（或侧栏由折叠恢复展开）时，把选中项的父链写入 openKeys
  useEffect(() => {
    if (siderCollapse || isHorizontal) {
      // horizontal 模式手风琴无意义，跳过
      return;
    }
    const match = findMenuByPath(menus, pathname);
    setOpenKeys(match ? match.parents.map(item => item.key) : []);
  }, [menus, pathname, siderCollapse, isHorizontal, setOpenKeys]);

  // 路由变化时重置手动覆盖态 activeKey，让派生值接管（与 skyroc useUpdateEffect 等价）
  useEffect(() => {
    resetActiveKeys();
  }, [pathname, resetActiveKeys]);

  function handleOpenChange(keys: string[]) {
    setOpenKeys(keys);
  }

  function handleSelect({ key }: { key: string }) {
    const target = menuIndex.get(key);
    if (!target) {
      return;
    }

    if (selectBehavior === 'activateFirst') {
      // FirstLevel 模式：先写入 activeKey，是否导航取决于有无子级
      setActiveKey(key);
      const hasChildren = Boolean(target.children && target.children.length > 0);
      if (hasChildren) {
        return;
      }
      // 无子级 → 直接导航
      if (!target.path) {
        return;
      }
      void navigate({ to: target.path as never });
      return;
    }

    // default 模式：只有 path 非空项可导航，无子级也不响应
    if (!target.path) {
      return;
    }
    void navigate({ to: target.path as never });
  }

  if (!container) {
    return null;
  }

  return createPortal(
    <Menu
      className="h-full border-0!"
      inlineIndent={18}
      items={items}
      mode={menuMode}
      onOpenChange={isHorizontal ? undefined : handleOpenChange}
      onSelect={handleSelect}
      openKeys={isHorizontal ? undefined : openKeys}
      selectedKeys={selectedKeys}
      style={{ width: '100%' }}
      // horizontal 形态不能出现 inlineCollapsed 键（antd 会告警），用条件展开而不是传 undefined
      {...(isHorizontal ? {} : { inlineCollapsed: siderCollapse })}
    />,
    container,
  );
});

export default AdminMenu;
