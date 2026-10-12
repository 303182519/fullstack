import { Logger, ValidationPipe } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { NestFactory } from '@nestjs/core'
import { NestExpressApplication } from '@nestjs/platform-express'
import { Logger as PinoLogger } from 'nestjs-pino'
import { AppModule } from './app.module.js'

async function bootstrap() {
  // bufferLogs：启动早期日志先缓存，等 useLogger 桥接后再统一输出，避免丢失启动日志
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
  })

  // 使用 Pino Logger
  app.useLogger(app.get(PinoLogger))

  // 下面的配置根据实际情况选择开启, 只有确定请求一定经过你可控的代理（Nginx / 负载均衡），才打开这个配置。
  // 没有代理，直接对外：trust proxy: false（默认）
  // 1. 同机器部署(Nginx+Nest)，安全组限制3000仅本机访问, 即使接入CDN，这套配置也可以继续用，不用改trust‑proxy。
  // app.set('trust proxy', 'loopback'); // 信任来自环回地址的请求
  // 2. 跨机器部署 Nginx (192.168.200.128) → Nest
  // app.set('trust proxy', ['192.168.200.128']); // 信任来自Nginx的请求

  // 全局校验管道：自动剥离未声明字段、类型转换、拒绝非法入参
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  )
  // 优雅关闭：配合生命周期钩子释放数据库连接等资源
  app.enableShutdownHooks()

  // 与 api 服务区分默认端口，支持同机并行启动
  const port = app.get(ConfigService).get<number>('PORT', 3001)
  await app.listen(port)

  new Logger('Bootstrap').log(`Admin API 服务已启动: http://localhost:${port}`)
}

void bootstrap()
