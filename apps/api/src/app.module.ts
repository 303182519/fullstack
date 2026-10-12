import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { AppController } from './app.controller.js'
import { AppService } from './app.service.js'

@Module({
  imports: [
    // 全局配置模块：统一读取 .env 与进程环境变量
    ConfigModule.forRoot({ isGlobal: true }),
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
