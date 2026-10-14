import { createPrismaClientOptions, Prisma, PrismaClient } from '@fedstack/database';
import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IsDev } from '@/common/constants/environment.js';
import { getConfig } from '@/config/configuration.js';

/**
 * 后台管理服务（admin-api）的 Prisma 客户端。
 *
 * 说明：
 * - 继承 PrismaClient 以保留完整的类型化查询能力（各服务自建，见 ADR-001 Q1）。
 * - 连接参数从本服务自身的环境注入；共享包 @fedstack/database 不读取任何环境变量，
 *   因此同一份 schema 可以被多个服务以各自的连接配置使用。
 * - onModuleInit 主动连接数据库（启动即失败）；onModuleDestroy 释放连接池，
 *   由 main.ts 的 app.enableShutdownHooks() 触发。
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  /** 慢查询阈值（毫秒），达到即打印 `[SLOW_QUERY]` 日志 */
  private readonly slowQueryThreshold: number;

  constructor(configService: ConfigService) {
    const { database, logger: loggerConfig } = getConfig(configService);
    if (!database.url) {
      throw new Error('缺少必填环境变量 DATABASE_URL，无法初始化数据库连接');
    }

    super({
      ...createPrismaClientOptions({
        url: database.url,
        connectionLimit: database.connectionLimit,
      }),
      // 打开查询事件：驱动适配器会对每次查询计时，事件对象含 duration（毫秒）。
      // 注意 Prisma 无「只上报慢查询」的原生能力，事件是全量产生、由 onModuleInit
      // 中的回调按阈值过滤；这里只用 emit: 'event'，不额外向 stdout 打印。
      log: [{ emit: 'event', level: 'query' }],
    });

    this.slowQueryThreshold = Number(loggerConfig.slowQueryThreshold);
  }

  /**
   * 显式连接数据库。
   *
   * Prisma 本身是懒连接（首次查询才建池），这里提前触发的作用是启动即失败：
   * 数据库不可达时进程直接启动失败，而不是等到第一个业务请求才暴露问题，
   * 避免编排层把流量打到连接不通的实例上。
   */
  async onModuleInit(): Promise<void> {
    // 订阅查询事件：只有耗时达到阈值的查询才落日志，避免全量查询日志稀释有效信息。
    // 消息以 [SLOW_QUERY] 开头、级别为 warn，便于采集侧按前缀 / duration 配置告警。
    //
    // 关于类型断言：生成的 PrismaClient 类型把 LogOpts 默认成 never（正常应由构造参数推断），
    // 子类继承时拿不到 'query' 字面量，$on 的入参会被收窄成 never。这里按运行期事实
    // （已在 Prisma 7.9.1 驱动适配器路径核实会发 query 事件）显式放宽 LogOpts。
    const queryClient = this as unknown as PrismaClient<Prisma.LogLevel>;
    queryClient.$on('query', (event) => {
      if (event.duration < this.slowQueryThreshold)
        return;

      // params 是值化后的绑定参数串，可能含密码哈希 / 令牌 / 个人信息等敏感值。
      // 按仓库日志安全规范，仅在开发环境输出，生产只保留 SQL 模板与耗时。
      const params = IsDev ? ` | 参数: ${event.params}` : '';

      this.logger.warn(
        `[SLOW_QUERY] ${Math.round(event.duration)}ms 超过阈值 ${this.slowQueryThreshold}ms | ${event.query}${params}`,
      );
    });

    await this.$connect();
    this.logger.log('数据库连接成功');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
    this.logger.log('数据库连接已释放');
  }
}
