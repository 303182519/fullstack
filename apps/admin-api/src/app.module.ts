import { Module } from '@nestjs/common'
import { AppConfigModule } from '@/config/config.module.js';
import { LoggerModule } from '@/shared/logger/logger.module.js';
import { AppController } from './app.controller.js'
import { AppService } from './app.service.js'
import { CommonModule } from '@/common/common.module.js';

@Module({
  imports: [
    AppConfigModule,
    CommonModule,
    LoggerModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
