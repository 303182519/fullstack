/**
 * 模块编号注册表（MMSNN 规范的 MM 部分，见 ADR-011）。
 *
 * 单一信源：所有业务模块的 errors.ts 必须从此表 import 自己的模块号，
 * 禁止在模块内硬编码 `XXA01` 里的 XX 两位数字。
 *
 * 新增模块流程：
 *   1. 先查此表，挑一个未占用的 2 位十进制（按业务顺序递增分配，不复用）；
 *   2. 在本表追加一行；
 *   3. 在模块目录下新建 errors.ts，从本表 import 号段；
 *   4. 更新 ADR-011 文档的注册表（人工同步）。
 *
 * 编号分配纪律：
 *   - 不回收、不复用已删除模块的编号（防止历史日志歧义）；
 *   - 10–89 为业务模块，90–99 为 P3/P4 新增预分配区；
 *   - 00 为通用/系统级（BizCode 兜底，见 common/response/base.response.ts）。
 */
export const MODULE_CODES = {
  /** 认证基础设施（shared/auth/，跨模块共享） */
  AUTH: 10,
  /** 用户（modules/user/） */
  USER: 20,
  /** 角色（modules/role/） */
  ROLE: 30,
  /** 菜单（modules/menu/） */
  MENU: 40,
  /** 部门（modules/dept/） */
  DEPT: 50,
  /** 租户（modules/tenant/） */
  TENANT: 60,
  /** 参数配置（modules/config/） */
  CONFIG: 70,
  /** 字典（modules/dict/） */
  DICT: 80,
  /** 文件/存储（modules/file/）—— 原裸占 Auth 号段，P3a 新增独立号段 */
  FILE: 90,
  /** 租户套餐（modules/tenant-package/） */
  TENANT_PACKAGE: 91,
  /** 审计监控（modules/monitor/） */
  MONITOR: 92,
  /** 站内信（P3b，预留） */
  USER_MESSAGE: 93,
  /** 通知公告（P3b，预留） */
  NOTICE: 94,
  /** SMS 通道（P3b，预留） */
  SMS: 95,
  /** Mail 通道（P3b，预留） */
  MAIL: 96,
  /** MFA（P3b，预留） */
  MFA: 97,
  /** 定时任务（P4，预留） */
  JOB: 98,
} as const;

export type ModuleCode = (typeof MODULE_CODES)[keyof typeof MODULE_CODES];

/** 辅助：按模块号构造 MMSNN 业务码字符串 */
export function buildBizCode(
  moduleCode: ModuleCode,
  subtype: 'A' | 'B' | 'C',
  seq: number,
): string {
  return `${String(moduleCode).padStart(2, '0')}${subtype}${String(seq).padStart(2, '0')}`;
}
