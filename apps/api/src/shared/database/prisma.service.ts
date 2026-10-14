import { createPrismaClientOptions, PrismaClient } from '@fedstack/database';
import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * 业务服务（api）的 Prisma 客户端。
 *
 * 说明：
 * - 继承 PrismaClient 以保留完整的类型化查询能力（各服务自建，见 ADR-001 Q1）。
 * - 连接参数从本服务自身的环境注入；共享包 @fedstack/database 不读取任何环境变量。
 * - onModuleInit 主动连接数据库（启动即失败）；onModuleDestroy 释放连接池，
 *   由 main.ts 的 app.enableShutdownHooks() 触发。
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor(configService: ConfigService) {
    const url = configService.get<string>('DATABASE_URL');
    if (!url) {
      throw new Error('缺少必填环境变量 DATABASE_URL，无法初始化数据库连接');
    }
    const connectionLimit = Number(configService.get('DB_CONNECTION_LIMIT') ?? 10);

    super(createPrismaClientOptions({ url, connectionLimit }));
  }

  /**
   * 显式连接数据库。
   *
   * Prisma 本身是懒连接（首次查询才建池），这里提前触发的作用是启动即失败：
   * 数据库不可达时进程直接启动失败，而不是等到第一个业务请求才暴露问题，
   * 避免编排层把流量打到连接不通的实例上。
   */
  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
