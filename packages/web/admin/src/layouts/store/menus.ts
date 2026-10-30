import { create } from 'zustand';

/**
 * 菜单 UI 态（Zustand）。
 *
 * 1. 归属职责：只存菜单的交互 UI 态——`openKeys`（侧栏手风琴展开集合）、
 *    `activeKey` / `activeSecondKey`（当前激活的一级/二级菜单 key，混合模式 SK-3.6 消费）。
 *    菜单树本体是服务端数据，走 React Query（`['menus', 'available']`），**禁止**在此重复持有。
 * 2. 生命周期：会话级。跟随登录会话存在，布局卸载即失效。
 * 3. 初始化：`openKeys` 初值 `[]`，由 AdminMenu 按当前路由的父链写入（路由即真相）；
 *    `activeKey` / `activeSecondKey` 初值 `''`，路由变化时重置为空，派生时用「store值
 *    || 路由派生值」回退（与 skyroc `use-admin-menus.tsx` 行为一致）。
 * 4. 修改权责：AdminMenu 写入 `openKeys`；一级/二级菜单点击（混合模式 FirstLevelMenu）
 *    写入 `activeKey` / `activeSecondKey`；路由变化时由 AdminMenu 重置两者为空串。
 *    其余组件只读。
 * 5. 重置：无需显式重置——登出时 React Query 缓存由 `queryClient.clear()` 清掉，
 *    UI 态随布局卸载自然消亡。
 * 6. 持久化：不持久化。展开态是瞬态 UI，落 localStorage 会让刷新后的展开状态
 *    与路由派生结果互相打架。
 */
interface MenusUiState {
  /** 当前激活的一级菜单 key（混合模式用；vertical 模式下为空串，路由派生值生效） */
  activeKey: string;
  /** 当前激活的二级菜单 key（vertical-mix / vertical-hybrid-header-first 子栏用） */
  activeSecondKey: string;
  /** 侧栏手风琴展开的菜单 key 集合 */
  openKeys: string[];
  setActiveKey: (key: string) => void;
  setActiveSecondKey: (key: string) => void;
  setOpenKeys: (keys: string[]) => void;
  /** 路由变化时把手动覆盖态重置为空，让派生值接管 */
  resetActiveKeys: () => void;
}

export const useMenusStore = create<MenusUiState>()(set => ({
  activeKey: '',
  activeSecondKey: '',
  openKeys: [],
  resetActiveKeys: () => set({ activeKey: '', activeSecondKey: '' }),
  setActiveKey: key => set({ activeKey: key }),
  setActiveSecondKey: key => set({ activeSecondKey: key }),
  setOpenKeys: keys => set({ openKeys: keys }),
}));
