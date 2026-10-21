import { ApiProperty } from '@nestjs/swagger';

/** MFA 绑定状态 */
export class MfaStatusDto {
  @ApiProperty({ description: '是否已绑定' })
  bound: boolean;

  @ApiProperty({ description: '是否已启用（绑定完成并验证首码）' })
  enabled: boolean;

  @ApiProperty({ description: '恢复码剩余数量' })
  recoveryCodesRemaining: number;
}

/** MFA 绑定发起响应（含 otpauth URI 与一次性恢复码明文） */
export class MfaSetupDto {
  @ApiProperty({ description: 'otpauth URI（前端生成二维码）' })
  otpauthUri: string;

  @ApiProperty({ description: 'base32 密钥（手动输入备用）' })
  secret: string;

  @ApiProperty({
    description: '一次性恢复码明文（仅此一次返回，服务端只存 SHA-256 摘要，请用户立即离线保存）',
    type: [String],
  })
  recoveryCodes: string[];
}
