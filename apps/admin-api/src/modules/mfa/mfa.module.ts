import { Module } from '@nestjs/common';
import { MfaController } from './mfa.controller.js';
import { MfaService } from './mfa.service.js';

/**
 * MFA 模块（P3b，ADR-013 D8）。
 *
 * - 自助端点：/mfa/status、/mfa/setup、/mfa/bind、/mfa/unbind、/mfa/recovery-codes/reset；
 * - 登录二步：/auth/mfa/verify（在 AuthModule 中实现，依赖本模块的 MfaService）。
 */
@Module({
  controllers: [MfaController],
  providers: [MfaService],
  exports: [MfaService],
})
export class MfaModule {}
