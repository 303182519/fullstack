import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { PaginationQueryDto } from '@/common/dto/pagination.dto.js';

/**
 * 文件列表查询入参（P3a，ADR-012）。
 *
 * 分页参数（page / pageSize / skip）继承自 PaginationQueryDto，与其它查询 DTO 保持统一。
 * tenantId / deletedAt 等作用域参数由服务端注入，不信任客户端传入。
 */
export class QueryFileDto extends PaginationQueryDto {
  /** 业务归属过滤：如 'avatar' / 'notice' / undefined=全部 */
  @ApiPropertyOptional({ description: '业务归属标记，如 avatar / notice' })
  @IsOptional()
  @IsString()
  module?: string;

  /** MIME 前缀过滤：如 'image/' 匹配所有图片 */
  @ApiPropertyOptional({ description: 'MIME 前缀过滤，如 image/ 匹配所有图片' })
  @IsOptional()
  @IsString()
  mimeType?: string;

  /** 原始文件名模糊匹配 */
  @ApiPropertyOptional({ description: '原始文件名模糊匹配' })
  @IsOptional()
  @IsString()
  keyword?: string;

  /** 起始日期（UTC ISO） */
  @ApiPropertyOptional({ description: '起始日期' })
  @IsOptional()
  @IsString()
  dateFrom?: string;

  /** 截止日期（UTC ISO） */
  @ApiPropertyOptional({ description: '截止日期' })
  @IsOptional()
  @IsString()
  dateTo?: string;
}
