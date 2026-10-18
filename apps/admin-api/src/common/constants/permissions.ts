/**
 * 功能权限编码注册表（`sys_menu.perm_code` 的单一真相源）。
 *
 * 为什么集中登记：同一个权限码会被三处引用 ——
 * ① 控制器的 `@RequirePermission` 声明；② P2 播种脚本写入 `sys_menu.perm_code`；
 * ③ 前端按钮显隐判断。若各处硬编码字符串，拼写错误只会在线上暴露，且三处会互相漂移。
 * 收敛为 `as const` 常量后：拼错是编译错误；播种脚本可 import 同一份定义，不存在二次硬编码。
 *
 * 命名规范：`{域}:{模块}:{动作}`，动作用 `query/add/edit/remove`（与 REST 语义对齐）。
 * 本表只登记「受权限码约束的功能点」；平台超管专属功能（menu / package / tenant 管理）
 * 走 `SuperAdminGuard`，不在此表内。
 */
export const PERMISSIONS = {
  SYSTEM: {
    /** 用户管理：P0 已交付端点，P2 播种授权后收敛启用 */
    USER: {
      QUERY: 'system:user:query',
      ADD: 'system:user:add',
      EDIT: 'system:user:edit',
      REMOVE: 'system:user:remove',
    },
    /** 角色管理：AUTH 为 P1 已启用；CRUD 待 P2 收敛启用 */
    ROLE: {
      QUERY: 'system:role:query',
      ADD: 'system:role:add',
      EDIT: 'system:role:edit',
      REMOVE: 'system:role:remove',
      /** 角色菜单授权（P1 已启用，见 ADR-008 D3） */
      AUTH: 'system:role:auth',
    },
    /** 部门管理：P1 已启用 */
    DEPT: {
      QUERY: 'system:dept:query',
      ADD: 'system:dept:add',
      EDIT: 'system:dept:edit',
      REMOVE: 'system:dept:remove',
    },
  },
} as const;

/** 取出 `{ KEY: 'code' }` 对象所有值组成的字面量联合 */
type LeafValues<T> = T[keyof T];

type SystemModule = (typeof PERMISSIONS)['SYSTEM'];

/**
 * 已登记权限码的字面量联合类型。
 * 用于把 `@RequirePermission` 的入参收窄到「已登记的编码」，未登记字符串直接编译报错。
 */
export type PermissionCode = LeafValues<{
  [M in keyof SystemModule]: LeafValues<SystemModule[M]>;
}>;
