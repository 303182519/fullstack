import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * 布局壳客户端状态（对齐 skyroc `state/use-admin-state.ts`，jotai → Zustand）。
 *
 * - 归属职责：布局壳的纯 UI 偏好与瞬时交互态，不含任何业务 / 服务端数据。
 * - 生命周期：随页面内存存在；`siderCollapse` / `mixSiderFixed` 经 persist 落 localStorage。
 * - 初始化逻辑：默认值见下；持久化字段由 persist 在 store 创建时自动水合。
 * - 状态修改权责：只经本 store 的 action 修改，组件不得直接 `setState`。
 * - 重置行为：无显式重置；登出无需清理（不含敏感信息，偏好跨会话保留是预期行为）。
 * - 持久化行为：`partialize` 白名单只落 `siderCollapse` / `mixSiderFixed`；
 *   `reloadKey` 等瞬时值与 token 类绝不落地（D1/D5）。
 */
export interface LayoutState {
  /** 侧栏是否折叠（持久化） */
  siderCollapse: boolean;
  /** 全屏内容模式：隐藏顶栏 / 标签条 / 侧栏 / 页脚，只留内容区 */
  fullContent: boolean;
  /** 内容区横向滚动开关 */
  contentXScrollable: boolean;
  /** mix 类模式下子菜单栏是否固定展开（持久化） */
  mixSiderFixed: boolean;
  /**
   * 页面重挂载钥匙：自增触发 `key={reloadKey}` 重挂载，即「刷新当前标签页」。
   *
   * 用自增而非布尔翻转：布尔在同一渲染批次内翻转两次会被合并丢失，自增永远产生新值。
   */
  reloadKey: number;
  toggleSiderCollapse: () => void;
  setSiderCollapse: (v: boolean) => void;
  toggleFullContent: () => void;
  setContentXScrollable: (v: boolean) => void;
  toggleMixSiderFixed: () => void;
  reloadPage: () => void;
}

export const useLayoutStore = create<LayoutState>()(
  persist(
    set => ({
      siderCollapse: false,
      fullContent: false,
      contentXScrollable: false,
      mixSiderFixed: false,
      reloadKey: 0,

      toggleSiderCollapse: () => set(state => ({ siderCollapse: !state.siderCollapse })),
      setSiderCollapse: v => set({ siderCollapse: v }),
      toggleFullContent: () => set(state => ({ fullContent: !state.fullContent })),
      setContentXScrollable: v => set({ contentXScrollable: v }),
      toggleMixSiderFixed: () => set(state => ({ mixSiderFixed: !state.mixSiderFixed })),
      reloadPage: () => set(state => ({ reloadKey: state.reloadKey + 1 })),
    }),
    {
      name: 'admin-layout',
      partialize: state => ({ siderCollapse: state.siderCollapse, mixSiderFixed: state.mixSiderFixed }),
    },
  ),
);
