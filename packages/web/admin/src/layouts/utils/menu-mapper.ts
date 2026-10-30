import type { ReactNode } from 'react';

/**
 * 菜单 DTO → UI 模型的映射纯函数。
 *
 * 壳包不耦合 app 的 API 类型：`MenuDto` 是映射所需的最小输入契约，
 * app 侧 `MenuResponseDto`（`apps/admin/src/types/api/menu.d.ts`）结构化兼容即可直接传入。
 * 后端字段重命名/删减会在 app 调用处编译期报错，而不是运行期静默错乱。
 */

/** 菜单映射的最小输入契约（`GET /menus/available` 响应节点的子集） */
export interface MenuDto {
  /** 子菜单（后端始终返回数组，可能为空） */
  children: MenuDto[];
  /** 图标字符串（经 {@link MenuIconRegistry} 映射为组件；null 表示无图标） */
  icon: null | string;
  /** 菜单 ID（雪花字符串），映射为 UI 模型的 `key` */
  id: string;
  /** 菜单名称，映射为 UI 模型的 `label` */
  menuName: string;
  /** 菜单类型：'DIRECTORY' | 'MENU' | 'BUTTON'；BUTTON 一律不渲染 */
  menuType: string;
  /** 前端路由 path；null 表示不可导航（纯分组） */
  routePath: null | string;
  /** 同级排序值，升序 */
  sort: number;
  /** 菜单状态：'ACTIVE' | 'DISABLED'；DISABLED 不渲染 */
  status: string;
  /** 是否可见；false 不渲染 */
  visible: boolean;
}

/** 侧栏菜单的 UI 模型（antd Menu items 的中间态，与组件库解耦） */
export interface AdminMenuItem {
  /** 子菜单；缺省表示叶子节点 */
  children?: AdminMenuItem[];
  /** 图标节点（注册表命中时存在） */
  icon?: ReactNode;
  /** 菜单 ID，作为 antd Menu 的 key */
  key: string;
  /** 显示文本 */
  label: string;
  /** 导航路径；缺省表示该项不可导航（分组节点） */
  path?: string;
}

/**
 * 图标注册表：后端 `icon` 字符串 → 图标节点。
 *
 * 必须显式维护静态映射，禁止动态 import 拼路径（Rspack 无法静态分析，会打不进包）。
 * 壳包提供 `defaultMenuIconRegistry`（`utils/menu-icons.ts`），app 可扩展后传入。
 */
export type MenuIconRegistry = Record<string, ReactNode>;

const MENU_TYPE_BUTTON = 'BUTTON';
const MENU_TYPE_DIRECTORY = 'DIRECTORY';
const MENU_STATUS_DISABLED = 'DISABLED';

function isRenderable(dto: MenuDto): boolean {
  return dto.menuType !== MENU_TYPE_BUTTON && dto.visible && dto.status !== MENU_STATUS_DISABLED;
}

/**
 * DTO 树 → 菜单 UI 模型树。
 *
 * 规则（与调研文档 §3.3 映射表一致）：
 * - 过滤 `menuType === 'BUTTON'`、`visible === false`、`status === 'DISABLED'`；
 * - 同级按 `sort` 升序；
 * - `icon` 字符串经注册表映射，未注册或 null 则不渲染图标；
 * - 子级被过滤殆尽的 DIRECTORY 一并丢弃（空分组没有导航意义，避免产出指向 404 的叶子）。
 */
export function toAdminMenuTree(dtos: MenuDto[], iconRegistry: MenuIconRegistry = {}): AdminMenuItem[] {
  const items: AdminMenuItem[] = [];

  const sorted = dtos.toSorted((a, b) => a.sort - b.sort);

  for (const dto of sorted) {
    if (!isRenderable(dto)) {
      continue;
    }

    const children = toAdminMenuTree(dto.children, iconRegistry);

    if (dto.menuType === MENU_TYPE_DIRECTORY && children.length === 0) {
      continue;
    }

    const item: AdminMenuItem = {
      key: dto.id,
      label: dto.menuName,
    };

    const icon = dto.icon == null ? undefined : iconRegistry[dto.icon];
    if (icon !== undefined) {
      item.icon = icon;
    }

    if (dto.routePath != null) {
      item.path = dto.routePath;
    }

    if (children.length > 0) {
      item.children = children;
    }

    items.push(item);
  }

  return items;
}

/** 路径匹配结果：命中的菜单项 + 其祖先链（从根到直接父级，不含自身） */
export interface MenuPathMatch {
  item: AdminMenuItem;
  parents: AdminMenuItem[];
}

/**
 * 按当前路由 pathname 在菜单树中找选中项。
 *
 * 匹配策略（仅用于高亮，不用于路由注册）：精确匹配优先，其次 `path + '/'` 前缀匹配；
 * 多个前缀命中时取 path 最长者（最具体的项）。无命中返回 null。
 */
export function findMenuByPath(menus: AdminMenuItem[], pathname: string): MenuPathMatch | null {
  let best: MenuPathMatch | null = null;

  const walk = (items: AdminMenuItem[], parents: AdminMenuItem[]) => {
    for (const item of items) {
      if (item.path !== undefined) {
        const exact = pathname === item.path;
        const prefix = pathname.startsWith(`${item.path}/`);
        if ((exact || prefix) && (best === null || item.path.length > best.item.path!.length)) {
          best = { item, parents };
        }
      }
      if (item.children) {
        walk(item.children, [...parents, item]);
      }
    }
  };

  walk(menus, []);
  return best;
}

/**
 * 菜单树扁平化为 `key → item` 索引。
 *
 * 点击导航时 antd 只回传 key，用它查出目标 path 再 `navigate`。
 */
export function indexMenusByKey(menus: AdminMenuItem[]): Map<string, AdminMenuItem> {
  const index = new Map<string, AdminMenuItem>();

  const walk = (items: AdminMenuItem[]) => {
    for (const item of items) {
      index.set(item.key, item);
      if (item.children) {
        walk(item.children);
      }
    }
  };

  walk(menus);
  return index;
}
