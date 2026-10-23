import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';

@Module({
  imports: [
    // 全局配置模块：统一读取 .env 与进程环境变量
    ConfigModule.forRoot({ isGlobal: true }),
    // 全局日志模块：pino 结构化日志，自动记录每个 HTTP 请求
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
