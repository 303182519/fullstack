import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

/**
 * 通用分页查询入参。
 *
 * pageSize 上限 100：防止调用方传入超大 pageSize 造成无界查询（后端规范 §14）。
 * 校验走全局 ValidationPipe（whitelist + transform + enableImplicitConversion），
 * 因此 query 里的字符串会被自动转成 number。
 */
export class PaginationQueryDto {
  @ApiPropertyOptional({ description: '页码，从 1 开始', default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({
    description: '每页条数',
    default: 20,
    minimum: 1,
    maximum: 100,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize: number = 20;

  /** Prisma skip 值（由 page/pageSize 派生，避免每个 Service 重复计算） */
  get skip(): number {
    return (this.page - 1) * this.pageSize;
  }
}

/** 统一分页返回体 */
export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}
