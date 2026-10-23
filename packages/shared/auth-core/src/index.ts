// 共享认证与授权核心的公开出口（见 ADR-010）。
//
// 边界：
// - 当前只导出「框架无关的功能权限码注册表」（纯字符串常量 + 字面量联合类型）；
// - 不依赖 NestJS / Prisma / 任何运行时库，保证三个消费方（后端鉴权声明、数据库播种、
//   前端按钮显隐）都能直接引用，不因宿主框架被绑定；
// - 认证运行时（JWT 策略、argon2 工具、权限装饰器骨架）后续按需沉淀进本包，
//   届时再评估其依赖边界并补充 ADR。

export { PERMISSIONS } from './permissions.js';
export type { PermissionCode } from './permissions.js';
