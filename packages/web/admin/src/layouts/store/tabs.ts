import { create } from 'zustand';

/**
 * 标签页客户端状态（对齐 skyroc `state/tabs/use-admin-tab.ts`，jotai → Zustand 简化版）。
 *
 * ⚠️ 本阶段为 B 方案（简化版）：**不做组件级 Keep-Alive 缓存**。
 * 标签条只负责路由历史可视化 + 快捷切换，切换标签等同普通路由跳转。
 *
 * - 归属职责：标签列表与激活态，不含 Keep-Alive 缓存（TanStack Query 已兜底数据层）。
 * - 生命周期：会话级，登出时显式 `reset()` 清空；不持久化（刷新重建）。
 * - tab key 策略：默认只用 `pathname`（不含 query），同路径不同查询参数共用一个 tab。
 *   后续如需 multiTab（完整 path + query 开新标签），在 `addTab` 里扩展即可。
 * - 固定标签：`closable=false` 的标签视为固定（默认首页 `/home`），closeAll / closeOthers 保留。
 * - 关闭跳转规则：右邻 → 左邻 → 首个固定标签（skyroc 同款，用户预期稳定）。
 */
export interface TabItem {
  /** tab 唯一标识：默认只用 pathname（不含 query），见上 */
  key: string;
  /** 完整路由 path（含 query），用于 navigate */
  path: string;
  /** 显示标题 */
  title: string;
  /** 是否可关闭（固定标签如首页为 false） */
  closable: boolean;
}

interface TabsState {
  tabs: TabItem[];
  activeKey: string;
  /** 新增标签（已存在则只更新 path/title 并激活） */
  addTab: (tab: Omit<TabItem, 'closable'> & { closable?: boolean }) => void;
  /** 关闭单个标签，返回下一个应激活的 tab key（调用方负责跳转路由） */
  removeTab: (key: string) => string | null;
  /** 关闭除指定 tab + 固定标签外的所有 */
  closeOthers: (key: string) => string | null;
  /** 关闭除固定标签外的所有 */
  closeAll: () => string | null;
  /** 激活指定 tab */
  setActive: (key: string) => void;
  /** 清空全部（登出调用） */
  reset: () => void;
}

export const useTabsStore = create<TabsState>()((set, get) => ({
  tabs: [],
  activeKey: '',

  addTab: (tabInput) => {
    const state = get();
    const closable = tabInput.closable ?? true;
    const existing = state.tabs.find(t => t.key === tabInput.key);

    if (existing) {
      // 已存在：只更新 path / title（navigate 时 query 可能变了）
      set({
        activeKey: tabInput.key,
        tabs: state.tabs.map(t =>
          t.key === tabInput.key
            ? { ...t, path: tabInput.path, title: tabInput.title }
            : t,
        ),
      });
    }
    else {
      set({
        activeKey: tabInput.key,
        tabs: [
          ...state.tabs,
          {
            closable,
            key: tabInput.key,
            path: tabInput.path,
            title: tabInput.title,
          },
        ],
      });
    }
  },

  removeTab: (key) => {
    const state = get();
    const index = state.tabs.findIndex(t => t.key === key);
    if (index === -1)
      return null;

    const newTabs = state.tabs.filter(t => t.key !== key);

    // 下一个应激活的 tab：右邻 → 左邻 → 固定标签 → null
    let nextKey: string | null = null;
    if (state.activeKey === key) {
      const rightNeighbor = newTabs[index];
      const leftNeighbor = newTabs[index - 1];
      const firstFixed = newTabs.find(t => !t.closable);
      nextKey = rightNeighbor?.key ?? leftNeighbor?.key ?? firstFixed?.key ?? null;
    }

    set({ tabs: newTabs, activeKey: nextKey ?? state.activeKey });
    return nextKey;
  },

  closeOthers: (key) => {
    const state = get();
    const toRemove = state.tabs.filter(t => t.key !== key && t.closable);
    const newTabs = state.tabs.filter(t => t.key === key || !t.closable);
    const removedActive = toRemove.some(t => t.key === state.activeKey);
    const nextKey = removedActive ? key : state.activeKey;
    set({ tabs: newTabs, activeKey: nextKey });
    return nextKey;
  },

  closeAll: () => {
    const state = get();
    const fixedTabs = state.tabs.filter(t => !t.closable);
    const wasActiveFixed = fixedTabs.some(t => t.key === state.activeKey);
    const nextKey = wasActiveFixed ? state.activeKey : (fixedTabs[0]?.key ?? null);
    set({ tabs: fixedTabs, activeKey: nextKey ?? state.activeKey });
    return nextKey;
  },

  setActive: key => set({ activeKey: key }),

  reset: () => set({ tabs: [], activeKey: '' }),
}));
