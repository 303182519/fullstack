// 共享持久化层的公开出口。
//
// 边界（见 ADR-001）：
// - 只导出「生成的 Prisma Client 类型/实例能力 + 连接参数工厂」。
// - 不导出任何业务查询或仓储方法；不依赖 NestJS，保证 CLI / worker / seed 场景同样可用。

export { Prisma, PrismaClient } from '../generated/prisma/client.js';
// 枚举（TenantStatus / UserStatus / Gender / RoleStatus / DataScope）同时包含「类型」与
// 「运行时值」（如 UserStatus.ACTIVE），业务查询需要按值过滤，故以值形式整体导出。
export * from '../generated/prisma/enums.js';
// 模型类型（如 SysUserModel / SysUserCreateInput 等）由 prisma-client 生成器产出到
// generated/prisma/models.ts，再由此处统一对外暴露——消费方（apps/*）一律从本包取数据库类型，
// 禁止直接 import '@prisma/client'（见 ADR-001：Prisma 类型的单一真相源在本包）。
export type * from '../generated/prisma/models.js';
export { createPrismaClientOptions } from './client.js';
export type { DatabaseConnectionOptions, PrismaClientOptions } from './client.js';
