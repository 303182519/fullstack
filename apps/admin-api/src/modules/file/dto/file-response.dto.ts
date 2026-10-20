import { ApiProperty } from '@nestjs/swagger';

/** 单个文件元数据响应体（不含二进制内容） */
export class FileResponseDto {
  @ApiProperty({ description: '雪花 ID（字符串形式）' })
  id: string;

  @ApiProperty({ description: '租户 ID（字符串形式）' })
  tenantId: string;

  @ApiProperty({ description: '上传用户 ID（字符串形式）' })
  uploaderId: string;

  @ApiProperty({ description: '上传用户名快照' })
  uploaderName: string;

  @ApiProperty({ description: '存储驱动：local / s3' })
  storage: 'local' | 's3';

  @ApiProperty({ description: 'S3 bucket（本地驱动为 null）' })
  bucket: string | null;

  @ApiProperty({ description: '存储对象键（后端生成，客户端不感知）' })
  objectKey: string;

  @ApiProperty({ description: '原始文件名' })
  originalName: string;

  @ApiProperty({ description: 'MIME 类型' })
  mimeType: string;

  @ApiProperty({ description: '原图字节数' })
  size: number;

  @ApiProperty({ description: '业务归属标记' })
  module: string | null;

  @ApiProperty({ description: '是否生成了封面（图片类且归一化未失败）' })
  hasCover: boolean;

  @ApiProperty({ description: '封面宽 × 高 × 大小（有封面时存在）' })
  cover: {
    key: string;
    format: string;
    width: number;
    height: number;
    size: number;
  } | null;

  @ApiProperty({ description: '创建时间（ISO 8601）' })
  createdAt: string;

  static from(row: FileRow): FileResponseDto {
    return {
      id: row.id.toString(),
      tenantId: row.tenantId.toString(),
      uploaderId: row.uploaderId.toString(),
      uploaderName: row.uploaderName ?? '',
      storage: row.storage.toLowerCase() as 'local' | 's3',
      bucket: row.bucket,
      objectKey: row.objectKey,
      originalName: row.originalName,
      mimeType: row.mimeType,
      size: row.size,
      module: row.module,
      hasCover: !!row.coverKey,
      cover: row.coverKey
        ? {
            key: row.coverKey,
            format: row.coverFormat!,
            width: row.coverWidth!,
            height: row.coverHeight!,
            size: row.coverSize!,
          }
        : null,
      createdAt: row.createdAt.toISOString(),
    };
  }
}

/** 服务层内部视图：SysFile 行 + 上传者快照（用于避免额外 JOIN） */
export interface FileRow {
  id: bigint;
  tenantId: bigint;
  uploaderId: bigint;
  uploaderName: string | null;
  storage: string;
  bucket: string | null;
  objectKey: string;
  originalName: string;
  mimeType: string;
  size: number;
  module: string | null;
  coverKey: string | null;
  coverFormat: string | null;
  coverWidth: number | null;
  coverHeight: number | null;
  coverSize: number | null;
  createdAt: Date;
}
