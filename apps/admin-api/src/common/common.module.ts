import {
  MiddlewareConsumer,
  Module,
  NestModule,
} from '@nestjs/common';
import cookieParser from 'cookie-parser';

@Module({
  providers: [

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
