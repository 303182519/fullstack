import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { Logger as PinoLogger } from 'nestjs-pino';
import { AppModule } from './app.module.js';

async function bootstrap() {
  // bufferLogs：启动早期日志先缓存，等 useLogger 桥接后再统一输出，避免丢失启动日志
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  // 使用 Pino Logger
  // app.useLogger(app.get(PinoLogger))

  // 全局校验管道：自动剥离未声明字段、类型转换、拒绝非法入参
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );
  // 优雅关闭：配合生命周期钩子释放数据库连接等资源
  app.enableShutdownHooks();

  const port = app.get(ConfigService).get<number>('PORT', 3000);
  await app.listen(port);

  new Logger('Bootstrap').log(`API 服务已启动: http://localhost:${port}`);
}

void bootstrap();
