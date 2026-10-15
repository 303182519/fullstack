import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { RedisCacheModule } from '@/shared/caching/cache.module';
import { HealthController } from './health.controller.js';
import { RedisHealthIndicator } from './redis.health.js';

@Module({
  imports: [TerminusModule, RedisCacheModule],
  controllers: [HealthController],
  providers: [RedisHealthIndicator],
})
export class HealthModule {}
