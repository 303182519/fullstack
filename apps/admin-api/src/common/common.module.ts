import {
  MiddlewareConsumer,
  Module,
  NestModule,
} from '@nestjs/common'
import cookieParser from 'cookie-parser'
import { RequestContextMiddleware } from './middleware/request-context.middleware.js'
import { RequestIdMiddleware } from './middleware/request-id.middleware.js'

@Module({
  providers: [

  ],
})
export class CommonModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    // 请求上下文（CLS）必须【最先】挂——它在最外层 .run(store, next) 开上下文，
    // 后续所有中间件 / controller / service / 拦截器都在这个 store 里，X-Cache 状态才传得出去。
    consumer.apply(RequestContextMiddleware).forRoutes('*')

    // 健康探针的自动访问日志由 logger.module.ts 的 autoLogging 统一过滤
    consumer.apply(cookieParser(), RequestIdMiddleware).forRoutes('*')
  }
}
