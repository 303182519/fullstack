import type { AdminMenuItem } from './menu-mapper';

/**
 * 从全量菜单树派生各层级菜单的纯函数（对齐 skyroc `use-admin-menus.tsx:62-74`）。
 *
 * 六模式共用：`firstLevelMenus` 被 horizontal / hybrid 模式的顶栏消费，
 * `secondLevelMenus` / `childLevelMenus` 被 vertical-mix 与全部 hybrid 模式的侧栏消费。
 * 纯函数：不读 store、不读 DOM，输入菜单树 + 当前激活的一级/二级 key，
 * 输出拆分后的各层级数组与派生的 hasChildren 布尔。
 */

export interface MenuLevelInput {
  /** 全量菜单 UI 模型树 */
  menus: AdminMenuItem[];
  /** 当前激活的一级菜单 key（空串则 secondLevelMenus 为空） */
  activeFirstKey: string;
  /** 当前激活的二级菜单 key（空串则 childLevelMenus 为空） */
  activeSecondKey: string;
}

export interface MenuLevelResult {
  /** 只保留一级（`children` 被剔除），供 horizontal/hybrid 顶栏渲染 */
  firstLevelMenus: AdminMenuItem[];
  /** 当前激活一级菜单的直接子菜单（二级），供混合模式侧栏渲染 */
  secondLevelMenus: AdminMenuItem[];
  /** 当前激活二级菜单的直接子菜单（三级），供 vertical-mix / vertical-hybrid-header-first 子栏渲染 */
  childLevelMenus: AdminMenuItem[];
  /** 激活的一级菜单是否有子级（决定 `top-hybrid-header-first` / `vertical-hybrid-header-first` 的侧栏显隐） */
  isActiveFirstHasChildren: boolean;
  /** 激活的二级菜单是否有子级（决定 vertical-mix 子栏显隐） */
  isActiveSecondHasChildren: boolean;
}

/**
 * 从菜单树派生一级/二级/三级子菜单与 hasChildren 标志。
 *
 * 逻辑（与 skyroc 完全同构）：
 * 1. firstLevelMenus = menus.map(剔除 children) —— 顶层菜单不展示嵌套
 * 2. secondLevelMenus = 找到 key === activeFirstKey 的节点的 children
 * 3. childLevelMenus = 在 secondLevelMenus 里找 key === activeSecondKey 的节点的 children
 * 4. hasChildren 布尔直接从 children.length > 0 派生
 *
 * 注意：activeFirstKey / activeSecondKey 为空串时对应层级返回空数组，
 * 这是调用方"手动覆盖态重置 → 路由派生接管"的回退路径。
 */
export function deriveMenuLevels(input: MenuLevelInput): MenuLevelResult {
  const { menus, activeFirstKey, activeSecondKey } = input;

  const firstLevelMenus = menus.map(({ children: _ignoredChildren, ...rest }) => rest);

  const activeFirst = activeFirstKey
    ? menus.find(item => item.key === activeFirstKey)
    : undefined;
  const secondLevelMenus = activeFirst?.children ?? [];
  const isActiveFirstHasChildren = activeFirstKey ? secondLevelMenus.length > 0 : false;

  const activeSecond = activeSecondKey
    ? secondLevelMenus.find(item => item.key === activeSecondKey)
    : undefined;
  const childLevelMenus = activeSecond?.children ?? [];
  const isActiveSecondHasChildren = activeSecondKey ? childLevelMenus.length > 0 : false;

  return {
    childLevelMenus,
    firstLevelMenus,
    isActiveFirstHasChildren,
    isActiveSecondHasChildren,
    secondLevelMenus,
  };
}

/**
 * 从路由的 `openKeys` 父链派生当前激活的一级/二级菜单 key（skyroc 回退逻辑）。
 *
 * skyroc 的做法：路由变化时把手动覆盖态（`activeFirstLevelMenuKey` / `activeSecondLevelMenuKey`）
 * 重置为空，然后派生时用 `store值 || 路由派生值`。本仓把派生值单独提供给调用方，
 * 由调用方决定何时回退：
 *
 * ```ts
 * const derived = deriveActiveKeysFromRoute(parents, selectedKey);
 * const effectiveFirst = store.activeKey || derived.activeFirstKey;
 * ```
 *
 * @param parents 菜单匹配结果的祖先链（从根到直接父级，不含自身）；`findMenuByPath` 第二个返回值
 * @param selectedKey 最终选中的菜单项 key（`findMenuByPath` 的 item.key）
 */
export function deriveActiveKeysFromRoute(parents: AdminMenuItem[], selectedKey: string): {
  activeFirstKey: string;
  activeSecondKey: string;
} {
  if (parents.length === 0) {
    return { activeFirstKey: selectedKey, activeSecondKey: selectedKey };
  }
  return {
    activeFirstKey: parents[0]?.key ?? selectedKey,
    activeSecondKey: parents[1]?.key ?? selectedKey,
  };
}
