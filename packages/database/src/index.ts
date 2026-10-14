// 共享持久化层的公开出口。
//
// 边界（见 ADR-001）：
// - 只导出「生成的 Prisma Client 类型/实例能力 + 连接参数工厂」。
// - 不导出任何业务查询或仓储方法；不依赖 NestJS，保证 CLI / worker / seed 场景同样可用。

export { Prisma, PrismaClient } from '../generated/prisma/client.js';
export { createPrismaClientOptions } from './client.js';
export type { DatabaseConnectionOptions, PrismaClientOptions } from './client.js';
