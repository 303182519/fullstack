import { Module } from '@nestjs/common'
import { AppConfigModule } from '@/config/config.module.js';
import { LoggerModule } from '@/shared/logger/logger.module.js';
import { AppController } from './app.controller.js'
import { AppService } from './app.service.js'

@Module({
  imports: [
    AppConfigModule,
    LoggerModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
