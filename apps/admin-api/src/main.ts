import { Logger, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Logger as PinoLogger } from 'nestjs-pino';
import { IsDev } from '@/common/constants/environment.js';
import { getAppConfig } from '@/config/configuration.js';
import { initSnowflake } from '@/shared/utils/snowflake.js';
import { useSwagger } from '@/shared/utils/swagger.js';
import { AppModule } from './app.module.js';

async function bootstrap() {
  // bufferLogs：启动早期日志先缓存，等 useLogger 桥接后再统一输出，避免丢失启动日志
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
  });

  if (IsDev) {
    // 本地开发环境开启跨域，生产环境关闭，原因：生产环境需要在Nginx后开启跨域，Nginx会自动处理跨域问题
    app.enableCors({
      origin: ['http://localhost:3003'],
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
      allowedHeaders: ['Content-Type', 'Authorization'],
      credentials: true, // 允许携带cookie凭证
    });
  }

  // 使用 Pino Logger
  app.useLogger(app.get(PinoLogger));

  // 获取配置
  const appConfig = getAppConfig(app);
  const { server, swagger, snowflake } = appConfig;

  // 初始化雪花Id
  initSnowflake(BigInt(snowflake.workerId), BigInt(snowflake.datacenterId));

  // 下面的配置根据实际情况选择开启, 只有确定请求一定经过你可控的代理（Nginx / 负载均衡），才打开这个配置。
  // 没有代理，直接对外：trust proxy: false（默认）
  // 1. 同机器部署(Nginx+Nest)，安全组限制3000仅本机访问, 即使接入CDN，这套配置也可以继续用，不用改trust‑proxy。
  // app.set('trust proxy', 'loopback'); // 信任来自环回地址的请求
  // 2. 跨机器部署 Nginx (192.168.200.128) → Nest
  // app.set('trust proxy', ['192.168.200.128']); // 信任来自Nginx的请求

  // 设置api前缀；健康探针（@fedstack/health）不进业务前缀：
  // 探针是基础设施契约（编排骨架 + 网关 ACL 消费），不属于版本化业务 API（见 ADR-004）
  app.setGlobalPrefix(server.apiPrefix, { exclude: ['health', 'health/ready'] });
  // 开启http请求版本控制
  app.enableVersioning({
    type: VersioningType.URI,
  });

  // 开启 Swagger 文档
  useSwagger(app);

  // 优雅关闭：配合生命周期钩子释放数据库连接等资源
  app.enableShutdownHooks();

  // 与 api 服务区分默认端口，支持同机并行启动
  const port = app.get(ConfigService).get<number>('PORT', 3001);
  await app.listen(port);

  const serverUrl = `http://127.0.0.1:${server.port}`;

  const logger = new Logger('Bootstrap');
  // 不再手工拼接 ANSI 颜色码：日志已统一走 pino，生产环境是 JSON（颜色码会变成噪声），
  // 开发环境的着色由 pino-pretty 负责。
  logger.log(`NODE_ENV: ${process.env.NODE_ENV}`);
  logger.log(`Application is running on: ${serverUrl}`);
  logger.log(`Swagger is running on: ${serverUrl}/${swagger.path}`);
}

void bootstrap();
