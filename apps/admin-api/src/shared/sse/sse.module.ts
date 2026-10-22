import type { DynamicModule } from '@nestjs/common';
import { Global, Module } from '@nestjs/common';
import { StreamEventsService } from './stream-events.service.js';

/**
 * SSE 流式公共模块（Phase 4 引入）。
 *
 * 提供：
 *   - StreamEventsService：Redis Stream per-entity 事件发布 / 回放 / 尾读。
 *     供 JobsController（jobs/:id/events）和未来 Agent 模块（agent/runs/:id/events）复用。
 *
 * 依赖 RedisCacheModule（@Global，由各 app 在根模块导入）：
 *   - StreamEventsService 注入 REDIS_CLIENT + KeyPrefixer，keyPrefix 由消费 app 配置。
 */
@Global()
@Module({})
export class SseModule {
  static forRoot(): DynamicModule {
    return {
      module: SseModule,
      providers: [StreamEventsService],
      exports: [StreamEventsService],
    };
  }
}
