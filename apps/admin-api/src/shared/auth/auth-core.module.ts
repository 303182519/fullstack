import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { getConfig } from '@/config/configuration.js';
import { CaptchaService } from './captcha.service.js';
import { PasswordService } from './password.service.js';
import { SessionService } from './session.service.js';

/**
 * 认证共享底座（应用层，不下沉为 workspace 包——见迁移路线图「不过度抽象」决策）。
 *
 * 提供三件可复用能力 + 已配置好的 JwtModule：
 * - PasswordService：argon2id 哈希 / 复杂度 / 密码历史
 * - SessionService：Redis 会话（多端登录、滑动过期、强制下线）
 * - CaptchaService：图形验证码
 *
 * JwtModule 统一注册（单一 secret + 默认 access 有效期），签发时按需覆盖 expiresIn，
 * 因此 access / refresh 用同一实例、不同有效期即可，无需两套令牌。
 */
@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const { jwt } = getConfig(configService);
        return {
          secret: jwt.secret,
          signOptions: { expiresIn: jwt.accessExpiresIn },
        };
      },
    }),
  ],
  providers: [PasswordService, SessionService, CaptchaService],
  exports: [JwtModule, PasswordService, SessionService, CaptchaService],
})
export class AuthCoreModule {}
