// Prisma 播种脚本（`prisma db seed`，命令登记在 prisma.config.ts migrations.seed）。
//
// 职责（见迁移路线图 P2 章节 / ADR-009）：
//   1. 平台级菜单树（含按钮级 permCode）幂等播种；
//   2. 保证默认租户（tenantCode='default'）存在，作为首次部署即可登录的入口；
//   3. 每个存量租户保证存在内置 admin 角色（isSystem=true, roleCode='admin'），
//      并将其与平台全量启用菜单建立绑定；
//   4. 默认租户下保证存在内置管理员账号（username='admin'，isSuper=true），
//      并绑定内置 admin 角色。
//
// 幂等性：全部按自然键 upsert —— 菜单按 routeName（目录/页面）或 permCode（按钮），
// 角色按 (tenantId, roleCode)，角色-菜单按唯一键 (roleId, menuId) 跳过已存在绑定。
// 重复执行不会产生重复数据；已存在行仅回补结构性字段（parentId/permCode/routePath/component），
// 不回写 sort / icon / visible 等允许运维在线调整的字段，避免每次播种覆盖人工配置。
//
// 注意：本脚本运行在 packages/database 内，**禁止** import apps/* 的代码（依赖方向：app → package）。
// 菜单树的 permCode 直接引用共享包 @fedstack/auth-core 的 PERMISSIONS 注册表
// （`sys_menu.perm_code` 的单一真相源，见 ADR-010）：注册表变更即编译期可见，不存在二次硬编码。

import type { PermissionCode } from '@fedstack/auth-core';
import type { Prisma, SysMenu } from '../generated/prisma/client.js';
import process from 'node:process';
import { PERMISSIONS } from '@fedstack/auth-core';
import { hash as argon2Hash, argon2id } from 'argon2';
import {
  DataScope,
  MenuStatus,
  MenuType,
  PrismaClient,
  RoleStatus,
  TenantStatus,
  UserStatus,
} from '../generated/prisma/client.js';
import { createPrismaClientOptions } from './client.js';

/**
 * 菜单树节点定义（平台级）。permCode 缺省表示目录/页面节点，以 routeName 为幂等键。
 * permCode 收窄为 `PermissionCode`：写入库的编码必须来自 `@fedstack/auth-core` 注册表，拼错即编译错误。
 */
interface MenuSeedNode {
  routeName: string;
  menuType: MenuType;
  menuName: string;
  routePath?: string;
  component?: string;
  permCode?: PermissionCode;
  icon?: string;
  sort?: number;
  children?: MenuSeedNode[];
}

/**
 * 平台级菜单树。与 PERMISSIONS 注册表的对应关系：
 *   - system:user:*   → 用户管理按钮组
 *   - system:role:*   → 角色管理按钮组（含 AUTH 角色授权）
 *   - system:dept:*   → 部门管理按钮组
 *   - system:dict:*   → 字典管理按钮组
 *   - system:config:* → 参数设置按钮组
 *   - system:file:*   → 文件管理按钮组（P3a，ADR-012）
 *   - monitor:*       → 系统监控页面按钮组（含 monitor:job:* 任务中心，P3b）
 */
const MENU_TREE: MenuSeedNode[] = [
  {
    routeName: 'SystemManagement',
    menuType: MenuType.DIRECTORY,
    menuName: '系统管理',
    routePath: '/system',
    icon: 'settings',
    sort: 1,
    children: [
      {
        routeName: 'SystemUser',
        menuType: MenuType.MENU,
        menuName: '用户管理',
        routePath: '/system/users',
        component: 'system/user/index',
        sort: 1,
        children: [
          { routeName: 'SystemUserQuery', menuType: MenuType.BUTTON, menuName: '用户查询', permCode: PERMISSIONS.SYSTEM.USER.QUERY },
          { routeName: 'SystemUserAdd', menuType: MenuType.BUTTON, menuName: '用户新增', permCode: PERMISSIONS.SYSTEM.USER.ADD },
          { routeName: 'SystemUserEdit', menuType: MenuType.BUTTON, menuName: '用户编辑', permCode: PERMISSIONS.SYSTEM.USER.EDIT },
          { routeName: 'SystemUserRemove', menuType: MenuType.BUTTON, menuName: '用户删除', permCode: PERMISSIONS.SYSTEM.USER.REMOVE },
        ],
      },
      {
        routeName: 'SystemRole',
        menuType: MenuType.MENU,
        menuName: '角色管理',
        routePath: '/system/roles',
        component: 'system/role/index',
        sort: 2,
        children: [
          { routeName: 'SystemRoleQuery', menuType: MenuType.BUTTON, menuName: '角色查询', permCode: PERMISSIONS.SYSTEM.ROLE.QUERY },
          { routeName: 'SystemRoleAdd', menuType: MenuType.BUTTON, menuName: '角色新增', permCode: PERMISSIONS.SYSTEM.ROLE.ADD },
          { routeName: 'SystemRoleEdit', menuType: MenuType.BUTTON, menuName: '角色编辑', permCode: PERMISSIONS.SYSTEM.ROLE.EDIT },
          { routeName: 'SystemRoleRemove', menuType: MenuType.BUTTON, menuName: '角色删除', permCode: PERMISSIONS.SYSTEM.ROLE.REMOVE },
          { routeName: 'SystemRoleAuth', menuType: MenuType.BUTTON, menuName: '角色授权', permCode: PERMISSIONS.SYSTEM.ROLE.AUTH },
        ],
      },
      {
        routeName: 'SystemDept',
        menuType: MenuType.MENU,
        menuName: '部门管理',
        routePath: '/system/depts',
        component: 'system/dept/index',
        sort: 3,
        children: [
          { routeName: 'SystemDeptQuery', menuType: MenuType.BUTTON, menuName: '部门查询', permCode: PERMISSIONS.SYSTEM.DEPT.QUERY },
          { routeName: 'SystemDeptAdd', menuType: MenuType.BUTTON, menuName: '部门新增', permCode: PERMISSIONS.SYSTEM.DEPT.ADD },
          { routeName: 'SystemDeptEdit', menuType: MenuType.BUTTON, menuName: '部门编辑', permCode: PERMISSIONS.SYSTEM.DEPT.EDIT },
          { routeName: 'SystemDeptRemove', menuType: MenuType.BUTTON, menuName: '部门删除', permCode: PERMISSIONS.SYSTEM.DEPT.REMOVE },
        ],
      },
      {
        routeName: 'SystemDict',
        menuType: MenuType.MENU,
        menuName: '字典管理',
        routePath: '/system/dicts',
        component: 'system/dict/index',
        sort: 4,
        children: [
          { routeName: 'SystemDictQuery', menuType: MenuType.BUTTON, menuName: '字典查询', permCode: PERMISSIONS.SYSTEM.DICT.QUERY },
          { routeName: 'SystemDictAdd', menuType: MenuType.BUTTON, menuName: '字典新增', permCode: PERMISSIONS.SYSTEM.DICT.ADD },
          { routeName: 'SystemDictEdit', menuType: MenuType.BUTTON, menuName: '字典编辑', permCode: PERMISSIONS.SYSTEM.DICT.EDIT },
          { routeName: 'SystemDictRemove', menuType: MenuType.BUTTON, menuName: '字典删除', permCode: PERMISSIONS.SYSTEM.DICT.REMOVE },
        ],
      },
      {
        routeName: 'SystemConfig',
        menuType: MenuType.MENU,
        menuName: '参数设置',
        routePath: '/system/configs',
        component: 'system/config/index',
        sort: 5,
        children: [
          { routeName: 'SystemConfigQuery', menuType: MenuType.BUTTON, menuName: '参数查询', permCode: PERMISSIONS.SYSTEM.CONFIG.QUERY },
          { routeName: 'SystemConfigAdd', menuType: MenuType.BUTTON, menuName: '参数新增', permCode: PERMISSIONS.SYSTEM.CONFIG.ADD },
          { routeName: 'SystemConfigEdit', menuType: MenuType.BUTTON, menuName: '参数编辑', permCode: PERMISSIONS.SYSTEM.CONFIG.EDIT },
          { routeName: 'SystemConfigRemove', menuType: MenuType.BUTTON, menuName: '参数删除', permCode: PERMISSIONS.SYSTEM.CONFIG.REMOVE },
        ],
      },
      {
        routeName: 'SystemFile',
        menuType: MenuType.MENU,
        menuName: '文件管理',
        routePath: '/system/files',
        component: 'system/file/index',
        sort: 6,
        children: [
          { routeName: 'SystemFileQuery', menuType: MenuType.BUTTON, menuName: '文件查询', permCode: PERMISSIONS.SYSTEM.FILE.QUERY },
          { routeName: 'SystemFileAdd', menuType: MenuType.BUTTON, menuName: '文件上传', permCode: PERMISSIONS.SYSTEM.FILE.ADD },
          { routeName: 'SystemFileRemove', menuType: MenuType.BUTTON, menuName: '文件删除', permCode: PERMISSIONS.SYSTEM.FILE.REMOVE },
          { routeName: 'SystemFileDownload', menuType: MenuType.BUTTON, menuName: '文件下载', permCode: PERMISSIONS.SYSTEM.FILE.DOWNLOAD },
        ],
      },
      {
        routeName: 'SystemNotice',
        menuType: MenuType.MENU,
        menuName: '通知公告',
        routePath: '/system/notices',
        component: 'system/notice/index',
        sort: 7,
        children: [
          { routeName: 'SystemNoticeQuery', menuType: MenuType.BUTTON, menuName: '公告查询', permCode: PERMISSIONS.SYSTEM.NOTICE.QUERY },
          { routeName: 'SystemNoticeAdd', menuType: MenuType.BUTTON, menuName: '公告新增', permCode: PERMISSIONS.SYSTEM.NOTICE.ADD },
          { routeName: 'SystemNoticeEdit', menuType: MenuType.BUTTON, menuName: '公告编辑', permCode: PERMISSIONS.SYSTEM.NOTICE.EDIT },
          { routeName: 'SystemNoticeRemove', menuType: MenuType.BUTTON, menuName: '公告删除', permCode: PERMISSIONS.SYSTEM.NOTICE.REMOVE },
        ],
      },
      {
        routeName: 'SystemMessageTemplate',
        menuType: MenuType.MENU,
        menuName: '消息模板',
        routePath: '/system/message-templates',
        component: 'system/message-template/index',
        sort: 8,
        children: [
          { routeName: 'SystemMessageTemplateQuery', menuType: MenuType.BUTTON, menuName: '模板查询', permCode: PERMISSIONS.SYSTEM.MESSAGE_TEMPLATE.QUERY },
          { routeName: 'SystemMessageTemplateAdd', menuType: MenuType.BUTTON, menuName: '模板新增', permCode: PERMISSIONS.SYSTEM.MESSAGE_TEMPLATE.ADD },
          { routeName: 'SystemMessageTemplateEdit', menuType: MenuType.BUTTON, menuName: '模板编辑', permCode: PERMISSIONS.SYSTEM.MESSAGE_TEMPLATE.EDIT },
          { routeName: 'SystemMessageTemplateRemove', menuType: MenuType.BUTTON, menuName: '模板删除', permCode: PERMISSIONS.SYSTEM.MESSAGE_TEMPLATE.REMOVE },
        ],
      },
    ],
  },
  {
    routeName: 'SystemMonitor',
    menuType: MenuType.DIRECTORY,
    menuName: '系统监控',
    routePath: '/monitor',
    icon: 'monitor',
    sort: 2,
    children: [
      {
        routeName: 'MonitorOperLog',
        menuType: MenuType.MENU,
        menuName: '操作日志',
        routePath: '/monitor/oper-logs',
        component: 'monitor/operlog/index',
        sort: 1,
        children: [
          { routeName: 'MonitorOperLogQuery', menuType: MenuType.BUTTON, menuName: '操作日志查询', permCode: PERMISSIONS.MONITOR.OPER_LOG.QUERY },
        ],
      },
      {
        routeName: 'MonitorLoginLog',
        menuType: MenuType.MENU,
        menuName: '登录日志',
        routePath: '/monitor/login-logs',
        component: 'monitor/loginlog/index',
        sort: 2,
        children: [
          { routeName: 'MonitorLoginLogQuery', menuType: MenuType.BUTTON, menuName: '登录日志查询', permCode: PERMISSIONS.MONITOR.LOGIN_LOG.QUERY },
        ],
      },
      {
        routeName: 'MonitorOnline',
        menuType: MenuType.MENU,
        menuName: '在线用户',
        routePath: '/monitor/online-users',
        component: 'monitor/online/index',
        sort: 3,
        children: [
          { routeName: 'MonitorOnlineQuery', menuType: MenuType.BUTTON, menuName: '在线用户查询', permCode: PERMISSIONS.MONITOR.ONLINE.QUERY },
          { routeName: 'MonitorOnlineRemove', menuType: MenuType.BUTTON, menuName: '强制下线', permCode: PERMISSIONS.MONITOR.ONLINE.REMOVE },
        ],
      },
      {
        routeName: 'MonitorMessageLog',
        menuType: MenuType.MENU,
        menuName: '消息日志',
        routePath: '/monitor/message-logs',
        component: 'monitor/messagelog/index',
        sort: 4,
        children: [
          { routeName: 'MonitorMessageLogQuery', menuType: MenuType.BUTTON, menuName: '消息日志查询', permCode: PERMISSIONS.SYSTEM.MESSAGE_LOG.QUERY },
        ],
      },
      {
        routeName: 'MonitorJob',
        menuType: MenuType.MENU,
        menuName: '任务中心',
        routePath: '/monitor/jobs',
        component: 'monitor/job/index',
        sort: 5,
        children: [
          { routeName: 'MonitorJobQuery', menuType: MenuType.BUTTON, menuName: '任务查询', permCode: PERMISSIONS.MONITOR.JOB.QUERY },
          { routeName: 'MonitorJobEdit', menuType: MenuType.BUTTON, menuName: '任务操作', permCode: PERMISSIONS.MONITOR.JOB.EDIT },
        ],
      },
    ],
  },
];

/** 内置租户管理员角色编码（与 PERMISSIONS 注释、ADR-009 保持一致） */
const BUILTIN_ADMIN_ROLE_CODE = 'admin';

/** 默认租户：首次部署即可登录的租户入口（前端登录页的租户编码默认值同为 'default'） */
const DEFAULT_TENANT_CODE = 'default';
const DEFAULT_TENANT_NAME = '默认租户';

/** 内置管理员账号的用户名（密码由 SEED_ADMIN_PASSWORD 注入） */
const BUILTIN_ADMIN_USERNAME = 'admin';

/**
 * 内置管理员的缺省初始密码：仅在未提供 SEED_ADMIN_PASSWORD 时使用。
 * 该值是公开的，生产环境必须用环境变量注入随机密码，并在首次登录后立即修改。
 */
const FALLBACK_ADMIN_PASSWORD = 'Admin@123';

/**
 * argon2id 参数必须与 admin-api `PasswordService` 完全一致（ADR-007 D3），
 * 否则同一密码在不同入口的校验口径会漂移。改这里必须同步改
 * `apps/admin-api/src/shared/auth/password.service.ts`（依赖方向禁止 package 反向引用 app）。
 */
const ARGON2_OPTIONS = {
  type: argon2id,
  memoryCost: 65536,
  timeCost: 3,
  parallelism: 4,
} as const;

/**
 * 密码策略：长度 8-64 且至少包含一位小写、一位大写、一位数字。
 * 与 admin-api `auth.constants.ts` 的 PASSWORD_MIN_LENGTH / PASSWORD_COMPLEXITY 一致；
 * 播种侧提前拦截，避免写进一个永远无法通过登录校验的哈希。
 */
const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_MAX_LENGTH = 64;
const PASSWORD_COMPLEXITY = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/;

/** 播种期间的轻量 ID 生成：时间戳×1000 + 递增序号，仅在单次进程内要求唯一 */
let idSeq = 0;
function nextId(): bigint {
  return BigInt(Date.now()) * 1000n + BigInt(idSeq++);
}

/** 按幂等键查平台级菜单：按钮按 permCode，其余按 routeName */
async function findPlatformMenu(prisma: PrismaClient, node: MenuSeedNode): Promise<SysMenu | null> {
  const where: Prisma.SysMenuWhereInput
    = node.menuType === MenuType.BUTTON
      ? { tenantId: null, menuType: MenuType.BUTTON, permCode: node.permCode, deletedAt: null }
      : { tenantId: null, routeName: node.routeName, deletedAt: null };
  return prisma.sysMenu.findFirst({ where });
}

/** 幂等播种单个菜单节点，返回菜单行（含 id，供子节点挂接 parentId） */
async function seedMenuNode(
  prisma: PrismaClient,
  node: MenuSeedNode,
  parentId: bigint | null,
): Promise<SysMenu> {
  const existing = await findPlatformMenu(prisma, node);

  if (!existing) {
    return prisma.sysMenu.create({
      data: {
        id: nextId(),
        tenantId: null,
        parentId,
        menuType: node.menuType,
        menuName: node.menuName,
        routeName: node.routeName,
        routePath: node.routePath ?? null,
        component: node.component ?? null,
        permCode: node.permCode ?? null,
        icon: node.icon ?? null,
        sort: node.sort ?? 0,
        status: MenuStatus.ACTIVE,
      },
    });
  }

  // 已存在：仅回补结构性字段，人工调整过的展示字段（sort/icon/visible）不覆盖
  const data: Prisma.SysMenuUpdateInput = {
    parentId,
    menuType: node.menuType,
    routePath: node.routePath ?? null,
    component: node.component ?? null,
    permCode: node.permCode ?? null,
  };
  return prisma.sysMenu.update({ where: { id: existing.id }, data });
}

/** 深度优先播种整棵菜单树 */
async function seedMenuTree(prisma: PrismaClient): Promise<number> {
  let count = 0;
  for (const node of MENU_TREE) {
    const parent = await seedMenuNode(prisma, node, null);
    count += 1;
    for (const child of node.children ?? []) {
      const row = await seedMenuNode(prisma, child, parent.id);
      count += 1;
      for (const grandChild of child.children ?? []) {
        await seedMenuNode(prisma, grandChild, row.id);
        count += 1;
      }
    }
  }
  return count;
}

/**
 * 幂等：确保默认租户存在。
 * 按 tenantCode 唯一键查找（不过滤 deletedAt：软删行仍占用唯一键，重复 insert 会撞约束），
 * 已存在则复用；若该行已软删或非 ACTIVE，播种不擅自恢复，只告警交给运维处理。
 */
async function ensureDefaultTenant(prisma: PrismaClient): Promise<{ id: bigint; created: boolean }> {
  const existing = await prisma.sysTenant.findFirst({
    where: { tenantCode: DEFAULT_TENANT_CODE },
    select: { id: true, status: true, deletedAt: true },
  });

  if (existing) {
    if (existing.deletedAt || existing.status !== TenantStatus.ACTIVE) {
      console.warn(`[seed] 默认租户 ${DEFAULT_TENANT_CODE} 已存在但不可用（软删或非 ACTIVE），请人工处理后再登录`);
    }
    return { id: existing.id, created: false };
  }

  const tenant = await prisma.sysTenant.create({
    data: {
      id: nextId(),
      tenantCode: DEFAULT_TENANT_CODE,
      tenantName: DEFAULT_TENANT_NAME,
      status: TenantStatus.ACTIVE,
    },
  });
  return { id: tenant.id, created: true };
}

/** 幂等：确保租户内置 admin 角色存在，返回 roleId（供菜单绑定与用户绑定复用） */
async function ensureTenantAdminRole(prisma: PrismaClient, tenantId: bigint): Promise<bigint> {
  const role = await prisma.sysRole.findFirst({
    where: { tenantId, roleCode: BUILTIN_ADMIN_ROLE_CODE, deletedAt: null },
  });
  if (role)
    return role.id;

  const created = await prisma.sysRole.create({
    data: {
      id: nextId(),
      tenantId,
      roleName: '系统管理员',
      roleCode: BUILTIN_ADMIN_ROLE_CODE,
      description: '初始化播种的内置管理员角色：全量绑定平台菜单',
      dataScope: DataScope.ALL,
      status: RoleStatus.ACTIVE,
      isSystem: true,
    },
  });
  return created.id;
}

/**
 * 每个存量租户：确保内置 admin 角色存在，并全量绑定平台级启用菜单。
 * 绑定用 createMany + skipDuplicates（命中 uniq_role_menu 唯一键即跳过），天然幂等。
 */
async function seedTenantAdminRoles(prisma: PrismaClient): Promise<{ tenants: number; bindings: number }> {
  const tenants = await prisma.sysTenant.findMany({
    where: { deletedAt: null },
    select: { id: true },
  });

  const menus = await prisma.sysMenu.findMany({
    where: { tenantId: null, deletedAt: null, status: MenuStatus.ACTIVE },
    select: { id: true },
  });

  let bindings = 0;
  for (const tenant of tenants) {
    const roleId = await ensureTenantAdminRole(prisma, tenant.id);

    const result = await prisma.sysRoleMenu.createMany({
      data: menus.map(menu => ({ id: nextId(), roleId, menuId: menu.id })),
      skipDuplicates: true,
    });
    bindings += result.count;
  }

  return { tenants: tenants.length, bindings };
}

/** 密码策略前置校验：不合规直接终止播种，避免落库一个永远无法通过登录校验的哈希 */
function assertPasswordPolicy(plain: string): void {
  const lengthOk = plain.length >= PASSWORD_MIN_LENGTH && plain.length <= PASSWORD_MAX_LENGTH;
  if (!lengthOk || !PASSWORD_COMPLEXITY.test(plain)) {
    throw new Error(
      `[seed] SEED_ADMIN_PASSWORD 不符合密码策略：长度 ${PASSWORD_MIN_LENGTH}-${PASSWORD_MAX_LENGTH}，且需包含大写字母、小写字母和数字`,
    );
  }
}

/**
 * 幂等：确保默认租户下存在内置管理员账号，并绑定内置 admin 角色。
 *
 * 密码来源：SEED_ADMIN_PASSWORD，缺省回落到 FALLBACK_ADMIN_PASSWORD（仅便于本地初始化）。
 * 账号已存在时不重置密码（播种绝不覆盖人工改过的凭据），只补齐可能缺失的角色绑定。
 * isSuper=true：平台级端点（菜单维护、租户管理）由 SuperAdminGuard 要求该标记，
 * 否则空库首次部署将没有任何渠道创建租户。
 */
async function seedDefaultAdminUser(prisma: PrismaClient): Promise<'created' | 'exists' | 'skipped'> {
  const tenant = await prisma.sysTenant.findFirst({
    where: { tenantCode: DEFAULT_TENANT_CODE },
    select: { id: true, status: true, deletedAt: true },
  });
  if (!tenant || tenant.deletedAt || tenant.status !== TenantStatus.ACTIVE)
    return 'skipped';

  // 不过滤 deletedAt：软删行仍占用 (tenantId, username) 唯一键，硬插会撞约束
  const existing = await prisma.sysUser.findFirst({
    where: { tenantId: tenant.id, username: BUILTIN_ADMIN_USERNAME },
    select: { id: true, deletedAt: true },
  });

  const roleId = await ensureTenantAdminRole(prisma, tenant.id);

  if (existing) {
    if (existing.deletedAt) {
      console.warn(`[seed] 内置管理员 ${BUILTIN_ADMIN_USERNAME} 已软删，未自动恢复，请人工处理`);
    }
    await prisma.sysUserRole.createMany({
      data: [{ id: nextId(), userId: existing.id, roleId }],
      skipDuplicates: true,
    });
    return 'exists';
  }

  const plain = process.env.SEED_ADMIN_PASSWORD || FALLBACK_ADMIN_PASSWORD;
  assertPasswordPolicy(plain);

  const userId = nextId();
  await prisma.sysUser.create({
    data: {
      id: userId,
      tenantId: tenant.id,
      username: BUILTIN_ADMIN_USERNAME,
      password: await argon2Hash(plain, ARGON2_OPTIONS),
      nickname: '系统管理员',
      status: UserStatus.ACTIVE,
      isSuper: true,
    },
  });
  await prisma.sysUserRole.createMany({
    data: [{ id: nextId(), userId, roleId }],
    skipDuplicates: true,
  });
  return 'created';
}

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('[seed] 缺少 DATABASE_URL 环境变量');
    process.exitCode = 1;
    return;
  }

  const prisma = new PrismaClient(createPrismaClientOptions({ url }));
  try {
    const menuCount = await seedMenuTree(prisma);
    // 播种为 CLI 脚本，进度输出仅面向执行者，走标准输出（豁免 no-console）
    // eslint-disable-next-line no-console
    console.log(`[seed] 平台菜单播种完成：${menuCount} 个节点`);

    // 默认租户必须先于角色播种：角色/菜单绑定按存量租户遍历
    const defaultTenant = await ensureDefaultTenant(prisma);
    // eslint-disable-next-line no-console
    console.log(`[seed] 默认租户 ${defaultTenant.created ? '已创建' : '已存在'}：${DEFAULT_TENANT_CODE}`);

    const { tenants, bindings } = await seedTenantAdminRoles(prisma);
    // eslint-disable-next-line no-console
    console.log(`[seed] 租户管理员角色播种完成：${tenants} 个租户，新增绑定 ${bindings} 条`);

    const adminResult = await seedDefaultAdminUser(prisma);
    if (adminResult === 'created') {
      const passwordSource = process.env.SEED_ADMIN_PASSWORD ? 'SEED_ADMIN_PASSWORD' : `缺省值 ${FALLBACK_ADMIN_PASSWORD}（请立即修改）`;
      // eslint-disable-next-line no-console
      console.log(`[seed] 内置管理员账号已创建：${DEFAULT_TENANT_CODE} / ${BUILTIN_ADMIN_USERNAME}，密码来源：${passwordSource}`);
    }
    else {
      // eslint-disable-next-line no-console
      console.log(`[seed] 内置管理员账号未新建（${adminResult === 'exists' ? '已存在，保留原密码' : '默认租户不可用，跳过'}）`);
    }
  }
  finally {
    await prisma.$disconnect();
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exitCode = 1;
});
