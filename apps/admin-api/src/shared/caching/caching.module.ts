import { Global, Module } from '@nestjs/common';
import { LoginAttemptService } from './login-attempt.service.js';
import { MfaAttemptService } from './mfa-attempt.service.js';

/**
 * 应用层缓存业务模块。
 *
 * 与 @fedstack/redis 的边界（见 ADR-003）：
 *   - 连接纪律、CacheService、数据结构服务等「任何 app 都一致」的基础设施在包里；
 *   - 这里只放 admin-api 自有的缓存业务（如账号级登录锁定策略）与业务 key 工厂（cache.constants.ts）。
 */
@Global()
@Module({
  providers: [LoginAttemptService, MfaAttemptService],
  exports: [LoginAttemptService, MfaAttemptService],
})
export class CachingModule {}
