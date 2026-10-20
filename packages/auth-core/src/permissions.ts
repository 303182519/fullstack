/**
 * 功能权限编码注册表（`sys_menu.perm_code` 的单一真相源）。
 *
 * 本文件位于共享包 `@fedstack/auth-core`，而非某个 app 内——因为它有横跨
 * 进程边界的多个消费方，且这些消费方无法互相 import（依赖方向 app → package）：
 *   ① apps/admin-api 控制器的 `@RequirePermission` 声明；
 *   ② packages/database 的播种脚本写入 `sys_menu.perm_code`；
 *   ③ 前端按钮显隐判断（将来）。
 * 若各自硬编码字符串，拼写错误只会在线上暴露，且多处会互相漂移。
 * 收敛到本包后：拼错是编译错误；播种脚本 import 同一份定义，不存在二次硬编码。
 * （决策与边界见 ADR-010。）
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
    /** 字典管理：P2 新增（平台级定义 + 租户级遮蔽，见 ADR-009） */
    DICT: {
      QUERY: 'system:dict:query',
      ADD: 'system:dict:add',
      EDIT: 'system:dict:edit',
      REMOVE: 'system:dict:remove',
    },
    /** 参数设置：P2 新增（遮蔽语义与字典一致，见 ADR-009） */
    CONFIG: {
      QUERY: 'system:config:query',
      ADD: 'system:config:add',
      EDIT: 'system:config:edit',
      REMOVE: 'system:config:remove',
    },
    /** 文件管理：P3a 新增（ADR-012） */
    FILE: {
      QUERY: 'system:file:query',
      ADD: 'system:file:add',
      REMOVE: 'system:file:remove',
      /** 下载（代理 / 直连签名）独立权限：下载即数据读取动作，与「查询元数据」区分 */
      DOWNLOAD: 'system:file:download',
    },
  },
  /** 系统监控：P2 新增 */
  MONITOR: {
    OPER_LOG: {
      QUERY: 'monitor:operlog:query',
    },
    LOGIN_LOG: {
      QUERY: 'monitor:loginlog:query',
    },
    /** 在线用户：REMOVE 覆盖「踢单会话」与「按用户全部下线」两类操作 */
    ONLINE: {
      QUERY: 'monitor:online:query',
      REMOVE: 'monitor:online:remove',
    },
  },
} as const;

/**
 * 取出嵌套常量对象最内层字符串字面量组成的联合（递归到「值全为 string」的层）。
 *
 * 为什么递归而非 `T[keyof T]` 一层取值：对联合做 `keyof` 是取「共有键」交集，
 * SYSTEM 与 MONITOR 无共有键会直接得 never；分布式条件类型可逐成员展开，天然规避。
 */
type LeafValues<T> = T extends Record<string, string>
  ? T[keyof T]
  : T extends object
    ? LeafValues<T[keyof T]>
    : never;

/**
 * 已登记权限码的字面量联合类型。
 * 用于把 `@RequirePermission` 的入参收窄到「已登记的编码」，未登记字符串直接编译报错；
 * 播种脚本的 `MenuSeedNode.permCode` 亦以此收窄，保证写入库的编码来自本注册表。
 */
export type PermissionCode = LeafValues<typeof PERMISSIONS>;
