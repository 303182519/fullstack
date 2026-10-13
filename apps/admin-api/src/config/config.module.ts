import { IsProduction } from '@/common/constants/environment.js';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { defaultConfig } from './config.default.js';
import { validationSchema } from './env.validation.js';
import { developmentConfig } from './env/config.development.js';
import { productionConfig } from './env/config.production.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema,
      load: [
        defaultConfig,
        IsProduction ? productionConfig : developmentConfig,
      ],
      // 开启缓存，提升读取process.env性能
      cache: true,
    }),
  ],
})
export class AppConfigModule {}
