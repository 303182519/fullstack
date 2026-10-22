import { Global, Module } from '@nestjs/common';
import { ScopeModule } from '@/shared/scope/scope.module.js';
import { JobsController } from './jobs.controller.js';
import { JobQueueModule } from './queue/job-queue.module.js';
import { JobProcessor } from './queue/job.processor.js';
import { JobRecordService } from './records/job-record.service.js';
import { JobRegistryService } from './registry/job-registry.service.js';
import { JobService } from './services/job.service.js';

/**
 * 异步任务中心（Phase 1 + Phase 2 聚合）。
 *
 * 本模块是 P3b 任务系统的完整基础设施，聚合四层职责：
 *   ┌─────────────────────────────────────────────────────┐
 *   │ 业务入口层  JobService.submit / cancel / compensate   │
 *   ├─────────────────────────────────────────────────────┤
 *   │ 持久化层    JobRecordService（条件更新状态机 + 死信） │
 *   ├─────────────────────────────────────────────────────┤
 *   │ BullMQ 层   JobQueueService + JobProcessor            │
 *   ├─────────────────────────────────────────────────────┤
 *   │ 扩展点      JobRegistryService（IJobHandler 注册中心） │
 *   └─────────────────────────────────────────────────────┘
 *
 * 业务模块接入（两步）：
 *   1. 实现 IJobHandler<TPayload, TResult>，声明 readonly name
 *   2. 构造函数注入 JobRegistryService，调用 registry.register(this) 自注册
 *   3. 把 handler 放进业务模块 providers（依赖注入会自动创建实例 → 构造函数里自动注册）
 *   4. 业务模块调 JobService.submit({ name, payload }) 提交任务
 *
 * 为什么放在 @Global + Global():
 *   JobRegistryService / JobRecordService 需要被各业务模块（message / file / audit）
 *   的 handler 构造函数注入。全局模块避免每个业务模块显式 imports。
 */
@Global()
@Module({
  imports: [
    // BullMQ 连接层（forRootAsync + registerQueue）+ JobQueueService
    JobQueueModule,
    // 租户作用域解析（ADR-009）：平台超管可代管，租户管理员强制本租户
    ScopeModule,
  ],
  controllers: [JobsController],
  providers: [
    // 注册中心：IJobHandler 自注册入口
    JobRegistryService,
    // DB 状态机：SysJobRun 条件更新 + 分页 + 死信检测
    JobRecordService,
    // BullMQ Worker：通用处理器（markActive → registry.get → handler.handle → markCompleted/markAttemptFailure）
    JobProcessor,
    // 业务入口：submit（落库→入队→补写bullJobId + 失败终态保护）/ cancel / compensate
    JobService,
  ],
  exports: [
    JobRegistryService,
    JobRecordService,
    JobService,
  ],
})
export class JobsModule {}
