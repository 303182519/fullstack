import type { BindMfaDto, MfaSetupDto, MfaStatusDto, UnbindMfaDto } from './dto/index.js';
import type { AuthPrincipal } from '@/shared/auth/auth.types.js';
import { Buffer } from 'node:buffer';
import * as crypto from 'node:crypto';
import { Prisma } from '@fedstack/database';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Secret, TOTP } from 'otpauth';
import { getConfig } from '@/config/configuration.js';
import { PrismaService } from '@/shared/database/prisma.service.js';
import { generateSnowflakeId } from '@/shared/utils/snowflake.js';
import { mfaErrors } from './errors.js';

/** MFA 策略键 */
export const MFA_POLICY_KEY = 'security.mfa.mode';

/**
 * TOTP 时钟容差窗口（±1 步 = 前后各 30 秒）。
 * 手机时钟漂移是常态，RFC 6238 §5.2 建议验证方接受相邻时间步；
 * 全部验证入口（绑定/解绑/重置/登录二步）统一走这个窗口。
 */
const TOTP_WINDOW = 1;

/** MFA 策略三态 */
export type MfaPolicyMode = 'DISABLED' | 'OPTIONAL' | 'REQUIRED';

/** 恢复码条目 */
interface RecoveryCodeEntry {
  hash: string;
  usedAt: string | null;
}

/**
 * MFA 服务（P3b，ADR-013 D8）。
 *
 * - TOTP：otpauth 库生成 / 验证；
 * - 恢复码：高熵随机码 SHA-256 摘要存储，使用后置 usedAt；
 * - secret 加密：AES-256-GCM，密钥来自 env（MFA_SECRET_ENC_KEY）；
 * - 策略：SysConfig 键 `security.mfa.mode`（DISABLED / OPTIONAL / REQUIRED）。
 */
@Injectable()
export class MfaService {
  private readonly logger = new Logger(MfaService.name);
  private readonly encKey: Buffer;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {
    const key = getConfig(configService).mfa?.secretEncKey;
    if (!key) {
      this.logger.warn('MFA_SECRET_ENC_KEY 未配置，MFA 功能不可用');
      this.encKey = Buffer.alloc(0);
    }
    else {
      this.encKey = Buffer.from(key, 'hex');
    }
  }

  /** 获取 MFA 状态 */
  async status(principal: AuthPrincipal): Promise<MfaStatusDto> {
    const row = await this.prisma.sysUserMfa.findUnique({
      where: { userId: BigInt(principal.userId) },
    });

    if (!row)
      return { bound: false, enabled: false, recoveryCodesRemaining: 0 };

    const codes = row.recoveryCodes as unknown as RecoveryCodeEntry[];
    const remaining = codes.filter(c => !c.usedAt).length;

    return {
      bound: true,
      enabled: row.enabledAt !== null,
      recoveryCodesRemaining: remaining,
    };
  }

  /** 发起绑定：生成 TOTP secret + 恢复码 */
  async setup(principal: AuthPrincipal): Promise<MfaSetupDto> {
    const userId = BigInt(principal.userId);
    const existing = await this.prisma.sysUserMfa.findUnique({
      where: { userId },
    });

    // 只有「已启用」的记录拒绝重复绑定。「绑定中」（enabledAt = null）允许重新生成：
    // 用户可能在扫码前刷新/关闭页面，此时 secret 与恢复码明文已丢失且后端无法再次提供，
    // 必须留出重开路径，否则该记录会永久占位，只能由管理员删库。
    if (existing && existing.enabledAt !== null)
      throw mfaErrors.alreadyBound();

    const secret = new Secret({ size: 20 });
    const totp = new TOTP({
      issuer: 'FedStack',
      label: principal.username,
      secret,
    });

    // 生成 10 个恢复码
    const codes = Array.from({ length: 10 }, () =>
      crypto.randomBytes(4).toString('hex').toUpperCase());
    const codeHashes = codes.map(code => ({
      hash: this.hashRecoveryCode(code),
      usedAt: null,
    }));

    // 加密存储 secret
    const secretCipher = this.encryptSecret(secret.base32);

    if (existing) {
      // 原子覆盖，避免与并发的 bind 竞争后把已启用记录重置。
      // 两个标签页同时 setup 时表现为 last-write-wins，先返回的二维码失效（记录尚未生效）。
      await this.overwritePendingBinding(userId, secretCipher, codeHashes);
    }
    else {
      try {
        await this.prisma.sysUserMfa.create({
          data: {
            id: BigInt(generateSnowflakeId()),
            userId,
            tenantId: BigInt(principal.tenantId),
            secretCipher,
            recoveryCodes: codeHashes as unknown as Prisma.InputJsonValue,
            enabledAt: null, // 绑定中，未验证首码
          },
        });
      }
      catch (error) {
        // 并发首次绑定：另一个请求已创建记录并触发 userId 唯一约束，退化为覆盖
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
          await this.overwritePendingBinding(userId, secretCipher, codeHashes);
        else
          throw error;
      }
    }

    // 恢复码仅在 setup 时明文返回一次，服务端只存 SHA-256 摘要
    return {
      otpauthUri: totp.toString(),
      secret: secret.base32,
      recoveryCodes: codes,
    };
  }

  /** 覆盖「绑定中」记录；条件 enabledAt = null 保证不会重置已启用的记录 */
  private async overwritePendingBinding(
    userId: bigint,
    secretCipher: string,
    codeHashes: RecoveryCodeEntry[],
  ): Promise<void> {
    const { count } = await this.prisma.sysUserMfa.updateMany({
      where: { userId, enabledAt: null },
      data: {
        secretCipher,
        recoveryCodes: codeHashes as unknown as Prisma.InputJsonValue,
      },
    });
    if (count === 0)
      throw mfaErrors.alreadyBound();
  }

  /** 验证首码，完成绑定 */
  async bind(principal: AuthPrincipal, dto: BindMfaDto): Promise<void> {
    const userId = BigInt(principal.userId);
    const row = await this.prisma.sysUserMfa.findUnique({
      where: { userId },
    });
    if (!row)
      throw mfaErrors.notFound();

    const secret = this.decryptSecret(row.secretCipher);
    const totp = new TOTP({ secret: Secret.fromBase32(secret) });

    if (totp.validate({ token: dto.code, window: TOTP_WINDOW }) === null)
      throw mfaErrors.invalidTotp();

    // 条件更新：以读取到的 secretCipher 作为条件，防止「另一个标签页刚重新 setup」后
    // 用旧 secret 验证通过却把新 secret 标记为已启用——那会导致用户 App 与库中密钥不一致。
    const { count } = await this.prisma.sysUserMfa.updateMany({
      where: { userId, secretCipher: row.secretCipher },
      data: { enabledAt: new Date() },
    });
    if (count === 0)
      throw mfaErrors.bindStateChanged();
  }

  /** 解绑（已启用需 TOTP 或恢复码；绑定中免验证码） */
  async unbind(principal: AuthPrincipal, dto: UnbindMfaDto): Promise<void> {
    const userId = BigInt(principal.userId);
    const row = await this.prisma.sysUserMfa.findUnique({
      where: { userId },
    });
    if (!row)
      throw mfaErrors.notFound();

    // 「绑定中」记录不参与登录判定（isEnabled 要求 enabledAt 非空），取消它无需验证码：
    // 用户刷新后可能既没扫码也没保存恢复码，这是唯一的自助出口。
    // 条件删除保证并发的 bind 抢先完成时不会误删已启用的记录。
    if (row.enabledAt === null) {
      const { count } = await this.prisma.sysUserMfa.deleteMany({
        where: { userId, enabledAt: null },
      });
      if (count === 0) {
        const current = await this.prisma.sysUserMfa.findUnique({
          where: { userId },
          select: { enabledAt: true },
        });
        // 并发 bind 已把记录变为启用态，不能把「取消」当成成功
        if (current)
          throw mfaErrors.alreadyBound();
      }
      return;
    }

    if (!dto.code)
      throw mfaErrors.codeRequired();

    // 尝试 TOTP 验证
    const secret = this.decryptSecret(row.secretCipher);
    const totp = new TOTP({ secret: Secret.fromBase32(secret) });
    if (totp.validate({ token: dto.code, window: TOTP_WINDOW }) !== null) {
      await this.prisma.sysUserMfa.delete({
        where: { userId },
      });
      return;
    }

    // 尝试恢复码验证
    const codes = row.recoveryCodes as unknown as RecoveryCodeEntry[];
    const hash = this.hashRecoveryCode(dto.code);
    const entry = codes.find(c => c.hash === hash && !c.usedAt);
    if (!entry)
      throw mfaErrors.invalidRecoveryCode();

    entry.usedAt = new Date().toISOString();
    await this.prisma.sysUserMfa.update({
      where: { userId: BigInt(principal.userId) },
      data: { recoveryCodes: codes as unknown as Prisma.InputJsonValue },
    });

    await this.prisma.sysUserMfa.delete({
      where: { userId: BigInt(principal.userId) },
    });
  }

  /** 重置恢复码（需 TOTP 验证） */
  async resetRecoveryCodes(principal: AuthPrincipal, dto: BindMfaDto): Promise<{ codes: string[] }> {
    const row = await this.prisma.sysUserMfa.findUnique({
      where: { userId: BigInt(principal.userId) },
    });
    if (!row)
      throw mfaErrors.notFound();

    const secret = this.decryptSecret(row.secretCipher);
    const totp = new TOTP({ secret: Secret.fromBase32(secret) });
    if (totp.validate({ token: dto.code, window: TOTP_WINDOW }) === null)
      throw mfaErrors.invalidTotp();

    const codes = Array.from({ length: 10 }, () =>
      crypto.randomBytes(4).toString('hex').toUpperCase());
    const codeHashes = codes.map(code => ({
      hash: this.hashRecoveryCode(code),
      usedAt: null,
    }));

    await this.prisma.sysUserMfa.update({
      where: { userId: BigInt(principal.userId) },
      data: { recoveryCodes: codeHashes as unknown as Prisma.InputJsonValue },
    });

    return { codes };
  }

  /** 验证 TOTP（登录二步用） */
  async verifyTotp(userId: bigint, code: string): Promise<boolean> {
    const row = await this.prisma.sysUserMfa.findUnique({
      where: { userId },
    });
    if (!row)
      return false;

    const secret = this.decryptSecret(row.secretCipher);
    const totp = new TOTP({ secret: Secret.fromBase32(secret) });
    // otpauth.validate 返回时间偏移量（number）或 null；不为 null 即验证通过
    return totp.validate({ token: code, window: TOTP_WINDOW }) !== null;
  }

  /** 验证恢复码（登录二步用） */
  async verifyRecoveryCode(userId: bigint, code: string): Promise<boolean> {
    const row = await this.prisma.sysUserMfa.findUnique({
      where: { userId },
    });
    if (!row)
      return false;

    const codes = row.recoveryCodes as unknown as RecoveryCodeEntry[];
    const hash = this.hashRecoveryCode(code);
    const entry = codes.find(c => c.hash === hash && !c.usedAt);
    if (!entry)
      return false;

    entry.usedAt = new Date().toISOString();
    await this.prisma.sysUserMfa.update({
      where: { userId },
      data: { recoveryCodes: codes as unknown as Prisma.InputJsonValue },
    });
    return true;
  }

  /** 检查用户是否启用 MFA */
  async isEnabled(userId: bigint): Promise<boolean> {
    const row = await this.prisma.sysUserMfa.findUnique({
      where: { userId },
      select: { enabledAt: true },
    });
    return row !== null && row.enabledAt !== null;
  }

  /**
   * 获取 MFA 策略（ADR-013 D8）。
   *
   * 遮蔽语义复用 ADR-009：租户级配置优先，不存在时回落平台级；
   * 未配置时默认 OPTIONAL（向后兼容，不阻断存量登录）。
   *
   * 注意：登录链路在 CLS 主体写入之前调用本方法，不能走 modules/config 的
   * `effectiveValue`（其依赖 `ScopeResolverService.resolveConsumer` 从 CLS 取主体）。
   */
  async getPolicyMode(tenantId: bigint): Promise<MfaPolicyMode> {
    const rows = await this.prisma.sysConfig.findMany({
      where: {
        configKey: MFA_POLICY_KEY,
        deletedAt: null,
        OR: [{ tenantId }, { tenantId: null }],
      },
      select: { tenantId: true, configValue: true },
    });

    const tenantRow = rows.find(r => r.tenantId === tenantId);
    const platformRow = rows.find(r => r.tenantId === null);
    const raw = tenantRow?.configValue ?? platformRow?.configValue;
    return this.parseMode(raw);
  }

  /** 解析策略值：空 / 未识别 → OPTIONAL（安全默认，不禁用不强制） */
  private parseMode(raw: string | undefined): MfaPolicyMode {
    if (!raw)
      return 'OPTIONAL';
    const v = raw.trim().toUpperCase();
    if (v === 'DISABLED')
      return 'DISABLED';
    if (v === 'REQUIRED')
      return 'REQUIRED';
    return 'OPTIONAL';
  }

  /** AES-256-GCM 加密 secret */
  private encryptSecret(plaintext: string): string {
    const iv = crypto.randomBytes(16);
    // 创建加密器，设置密钥和 IV
    const cipher = crypto.createCipheriv('aes-256-gcm', this.encKey, iv);
    // 开始加密
    let encrypted = cipher.update(plaintext, 'utf8', 'base64');
    // 完成加密
    encrypted += cipher.final('base64');
    // 获取认证标签（GCM）, 用于验证解密数据是否可信的校验信息
    const tag = cipher.getAuthTag();
    return `${iv.toString('base64')}:${tag.toString('base64')}:${encrypted}`;
  }

  /** AES-256-GCM 解密 secret */
  private decryptSecret(ciphertext: string): string {
    const parts = ciphertext.split(':');
    if (parts.length !== 3)
      throw new Error('MFA secretCipher 格式非法（期望 iv:tag:encrypted 三段式）');
    const [ivB64, tagB64, encrypted] = parts as [string, string, string];
    const iv = Buffer.from(ivB64, 'base64');
    const tag = Buffer.from(tagB64, 'base64');
    const decipher = crypto.createDecipheriv('aes-256-gcm', this.encKey, iv);
    decipher.setAuthTag(tag);
    let decrypted = decipher.update(encrypted, 'base64', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  }

  /** SHA-256 摘要恢复码 */
  private hashRecoveryCode(code: string): string {
    return crypto.createHash('sha256').update(code).digest('hex');
  }
}
