import { Module } from '@nestjs/common';
import { CommonModule } from '@/common/common.module.js';
import { ContextModule } from '@/common/context/context.module.js';
import { AppConfigModule } from '@/config/config.module.js';
import { PrismaModule } from '@/shared/database/prisma.module.js';
import { LoggerModule } from '@/shared/logger/logger.module.js';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';

@Module({
  imports: [
    ContextModule,
    AppConfigModule,
    CommonModule,
    LoggerModule,
    PrismaModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
