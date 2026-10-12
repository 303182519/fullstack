import { Logger, ValidationPipe } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { NestFactory } from '@nestjs/core'
import { AppModule } from './app.module.js'

async function bootstrap() {
  const app = await NestFactory.create(AppModule)

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
