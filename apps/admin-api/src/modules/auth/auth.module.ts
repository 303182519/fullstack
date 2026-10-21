import { Module } from '@nestjs/common';
import { MessageModule } from '@/modules/message/message.module.js';
import { MfaModule } from '@/modules/mfa/mfa.module.js';
import { AuthCoreModule } from '@/shared/auth/auth-core.module.js';
import { CachingModule } from '@/shared/caching/caching.module.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';

@Module({
  imports: [AuthCoreModule, CachingModule, MfaModule, MessageModule],
  controllers: [AuthController],
  providers: [AuthService],
  exports: [AuthService],
})
export class AuthModule {}
