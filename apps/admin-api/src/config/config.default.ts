import { registerAs } from '@nestjs/config';
import { AppConfig } from './configuration.interface.js';


export const defaultConfig = registerAs('default', (): AppConfig => ({
  server: {
    port: process.env.PORT || 3000,
    apiPrefix: 'api',
    // 服务超时时间，单位：秒
    timeout: 10,
  },
  swagger: {
    enabled: process.env.SWAGGER_OPEN || true,
    path: 'swagger',
    title: 'NestJS API',
    description: 'The NestJS API description',
    version: '1.0',
  },
  jwt: {
    secret: process.env.JWT_SECRET || '123456',
    accessExpiresIn: Number(process.env.JWT_ACCESS_EXPIRES_IN) || 900, // 15 分钟
    refreshExpiresIn: Number(process.env.JWT_REFRESH_EXPIRES_IN) || 604800, // 7 天
  },
  snowflake: {
    workerId: process.env.WORKER_ID || 0,
    datacenterId: process.env.DATACENTER_ID || 0,
  },
}));
