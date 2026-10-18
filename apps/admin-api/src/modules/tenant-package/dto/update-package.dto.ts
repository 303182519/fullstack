import { PartialType } from '@nestjs/swagger';
import { CreatePackageDto } from './create-package.dto.js';

/**
 * 更新套餐入参：全部字段可选。
 *
 * 复用 CreatePackageDto 的校验规则（长度、枚举、唯一编码格式），避免规则漂移；
 * packageCode 变更由服务端做全局唯一校验（改码不影响已绑定租户的功能范围）。
 */
export class UpdatePackageDto extends PartialType(CreatePackageDto) {}
