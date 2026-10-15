import {
  MiddlewareConsumer,
  Module,
  NestModule,
} from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import { globalPipes } from './pipes/index.js';

@Module({
  providers: [
    // 全局 ValidationPipe：注意 main.ts 不要再 useGlobalPipes，否则会跑两遍
    {
      provide: APP_PIPE,
      useFactory: globalPipes,
    },
  ],
})
export class CommonModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    // 请求上下文（CLS）与 requestId 的生成/落点均由 ContextModule（ADR-005）的
    // ClsMiddleware 在最前挂载处理（generateId + idGenerator + setup），故此处不再注册
    // RequestIdMiddleware；仅保留需要在本模块注册的 cookieParser。
    // 健康探针的自动访问日志由 logger.module.ts 的 autoLogging 统一过滤
    consumer.apply(cookieParser()).forRoutes('*');
  }
}
