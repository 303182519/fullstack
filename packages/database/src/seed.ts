// Prisma 播种脚本（`prisma db seed`，命令登记在 prisma.config.ts migrations.seed）。
//
// 职责（见迁移路线图 P2 章节 / ADR-009）：
//   1. 平台级菜单树（含按钮级 permCode）幂等播种；
//   2. 每个存量租户保证存在内置 admin 角色（isSystem=true, roleCode='admin'），
//      并将其与平台全量启用菜单建立绑定。
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
import { DataScope, MenuStatus, MenuType, PrismaClient, RoleStatus } from '../generated/prisma/client.js';
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
 *   - monitor:*       → 系统监控三个页面的按钮组
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
    ],
  },
];

/** 内置租户管理员角色编码（与 PERMISSIONS 注释、ADR-009 保持一致） */
const BUILTIN_ADMIN_ROLE_CODE = 'admin';

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
    const role = await prisma.sysRole.findFirst({
      where: { tenantId: tenant.id, roleCode: BUILTIN_ADMIN_ROLE_CODE, deletedAt: null },
    });

    const roleId
      = role?.id
        ?? (
          await prisma.sysRole.create({
            data: {
              id: nextId(),
              tenantId: tenant.id,
              roleName: '系统管理员',
              roleCode: BUILTIN_ADMIN_ROLE_CODE,
              description: '初始化播种的内置管理员角色：全量绑定平台菜单',
              dataScope: DataScope.ALL,
              status: RoleStatus.ACTIVE,
              isSystem: true,
            },
          })
        ).id;

    const result = await prisma.sysRoleMenu.createMany({
      data: menus.map(menu => ({ id: nextId(), roleId, menuId: menu.id })),
      skipDuplicates: true,
    });
    bindings += result.count;
  }

  return { tenants: tenants.length, bindings };
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

    const { tenants, bindings } = await seedTenantAdminRoles(prisma);
    // eslint-disable-next-line no-console
    console.log(`[seed] 租户管理员角色播种完成：${tenants} 个租户，新增绑定 ${bindings} 条`);
  }
  finally {
    await prisma.$disconnect();
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exitCode = 1;
});
