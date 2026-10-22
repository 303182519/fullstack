import { HealthModule } from '@fedstack/health';
import { RedisCacheModule } from '@fedstack/redis';
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { PrismaHealthIndicator } from '@nestjs/terminus';
import { ThrottlerGuard } from '@nestjs/throttler';
import { CommonModule } from '@/common/common.module.js';
import { ContextModule } from '@/common/context/context.module.js';
import { JwtAuthGuard, PermissionGuard } from '@/common/guards/index.js';
import { AppConfigModule } from '@/config/config.module.js';
import { getConfig } from '@/config/configuration.js';
import { AuthModule } from '@/modules/auth/auth.module.js';
import { ConfigModule } from '@/modules/config/config.module.js';
import { DeptModule } from '@/modules/dept/dept.module.js';
import { DictModule } from '@/modules/dict/dict.module.js';
import { FileModule } from '@/modules/file/file.module.js';
import { MenuModule } from '@/modules/menu/menu.module.js';
import { MessageTemplateModule } from '@/modules/message-template/message-template.module.js';
import { MessageModule } from '@/modules/message/message.module.js';
import { MfaModule } from '@/modules/mfa/mfa.module.js';
import { MonitorModule } from '@/modules/monitor/monitor.module.js';
import { NoticeModule } from '@/modules/notice/notice.module.js';
import { RoleModule } from '@/modules/role/role.module.js';
import { PackageModule } from '@/modules/tenant-package/package.module.js';
import { TenantModule } from '@/modules/tenant/tenant.module.js';
import { UserMessageModule } from '@/modules/user-message/user-message.module.js';
import { UserModule } from '@/modules/user/user.module.js';
import { AuditModule } from '@/shared/audit/audit.module.js';
import { AuthCoreModule } from '@/shared/auth/auth-core.module.js';
import { CachingModule } from '@/shared/caching/caching.module.js';
import { PrismaModule } from '@/shared/database/prisma.module.js';
import { PrismaService } from '@/shared/database/prisma.service.js';
import { ImageProcessorModule } from '@/shared/image/image-processor.module.js';
import { JobsModule } from '@/shared/jobs/jobs.module.js';
import { LoggerModule } from '@/shared/logger/logger.module.js';
import { PermissionModule } from '@/shared/permission/permission.module.js';
import { ScopeModule } from '@/shared/scope/scope.module.js';
import { SseModule } from '@/shared/sse/sse.module.js';
import { StorageHealthIndicator } from '@/shared/storage/storage.health.js';
import { StorageModule } from '@/shared/storage/storage.module.js';
import { ThrottlerConfigModule } from '@/shared/throttler/throttler.module.js';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';

@Module({
  imports: [
    ContextModule,
    AppConfigModule,
    CommonModule,
    LoggerModule,
    // 全局限流（Redis 存储，跨实例共享计数；配置读 config.throttler，见 ADR-007）。
    // 认证端点在控制器上用 @Throttle 覆盖为更严策略（见 common/constants/auth.ts）。
    ThrottlerConfigModule,
    PrismaModule,
    // 共享缓存基础设施（@fedstack/redis）：配置由本 app 配置层注入，见 ADR-003
    RedisCacheModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => getConfig(configService).redis,
    }),
    // SSE 流式基础设施：Redis Stream per-entity 事件发布 / 回放 / 尾读。
    // 供 JobsController（/jobs/:id/events）和未来 Agent 模块复用。
    SseModule.forRoot(),
    // 应用层缓存业务（登录锁定策略、业务 key 工厂）
    CachingModule,
    // 文件存储抽象（ADR-012）：单一活动驱动由 STORAGE_DRIVER 选定；@Global
    StorageModule,
    // 图片核验与封面派生（ADR-012 D4）：纯字节变换，不依赖库表与存储驱动；@Global
    ImageProcessorModule,
    // 权限底座（功能权限 + 数据权限）：@Global，供全局 PermissionGuard 与各业务模块复用
    PermissionModule,
    // 认证共享底座：JwtModule + Password/Session/Captcha 服务。
    // AppModule 直接 import 的目的是让全局 JwtAuthGuard 能解析 JwtService / SessionService。
    AuthCoreModule,
    // 审计底座（ADR-009）：@OperLog 全局拦截器 + 登录日志写入器；@Global
    AuditModule,
    // 主体作用域解析（租户管理员/平台超管 代管语义）；@Global
    ScopeModule,
    // 业务模块
    AuthModule,
    UserModule,
    RoleModule,
    DeptModule,
    MenuModule,
    TenantModule,
    PackageModule,
    DictModule,
    ConfigModule,
    MonitorModule,
    FileModule,
    MessageModule,
    MessageTemplateModule,
    MfaModule,
    NoticeModule,
    UserMessageModule,
    JobsModule,
    // 共享健康检查底座（@fedstack/health，见 ADR-004）：
    // Redis 检查内置；本 app 装配数据库 + 存储就绪检查
    HealthModule.forRootAsync({
      inject: [PrismaHealthIndicator, PrismaService, StorageHealthIndicator],
      useFactory: (
        db: PrismaHealthIndicator,
        prisma: PrismaService,
        storage: StorageHealthIndicator,
      ) => ({
        readinessChecks: [
          // PrismaHealthIndicator 内部执行 SELECT 1，默认 1000ms 超时
          () => db.pingCheck('database', prisma),
          // 存储探针：对一个不存在的 key 调 exists，返回 false = 可达，抛出 = 不可达
          () => storage.pingCheck('storage'),
        ],
      }),
    }),
  ],
  controllers: [AppController],
  providers: [
    AppService,
    // 全局守卫执行顺序 = 注册顺序：先限流（廉价，挡洪泛），后鉴权（较贵，验令牌+查会话），
    // 最后功能权限（依赖 JwtAuthGuard 写入的 request.user，故必须排在其后）
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionGuard },
  ],
})
export class AppModule {}
