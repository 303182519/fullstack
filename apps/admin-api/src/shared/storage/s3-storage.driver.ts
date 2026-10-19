import type { Readable } from 'node:stream';
import type { PutObjectInput, StorageDriver } from './storage.types.js';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Logger } from '@nestjs/common';

/** S3 驱动构造参数（由配置层注入，驱动本身不读 env）。 */
export interface S3StorageOptions {
  /** S3 兼容端点；AWS 官方可留空走默认区域端点（MinIO / COS / OSS 必须显式配置）。 */
  endpoint?: string;
  region: string;
  bucket: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  /** MinIO 等自建端点须为 true；AWS S3 为 false。 */
  forcePathStyle?: boolean;
}

/**
 * S3 兼容驱动：适配 MinIO / 腾讯 COS / 阿里云 OSS 等对象存储。
 *
 * 凭据只经构造参数注入（来自 env），不落库、不进日志（ADR-012 D2）。
 */
export class S3StorageDriver implements StorageDriver {
  readonly kind = 's3' as const;

  private readonly logger = new Logger(S3StorageDriver.name);
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(options: S3StorageOptions) {
    this.bucket = options.bucket;
    this.client = new S3Client({
      endpoint: options.endpoint,
      region: options.region,
      forcePathStyle: options.forcePathStyle ?? false,
      // 未显式给出密钥时留空，交由 SDK 默认凭证链（环境变量 / IAM 角色）解析
      credentials:
        options.accessKeyId && options.secretAccessKey
          ? {
              accessKeyId: options.accessKeyId,
              secretAccessKey: options.secretAccessKey,
            }
          : undefined,
    });
  }

  async put({ key, body, contentType }: PutObjectInput): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
      }),
    );
  }

  async getStream(key: string): Promise<Readable | null> {
    try {
      const res = await this.client.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      return (res.Body as Readable | undefined) ?? null;
    }
    catch (err) {
      if (isObjectNotFound(err))
        return null;
      throw err;
    }
  }

  async delete(key: string): Promise<void> {
    try {
      // S3 DeleteObject 对不存在的键返回成功，天然幂等
      await this.client.send(
        new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
      );
    }
    catch (err) {
      // 仅告警不抛出：删除为 best-effort，元数据软删不因对象删除失败而回滚
      this.logger.warn(`删除对象存储失败：${key}（${(err as Error).message}）`);
    }
  }

  async getSignedUrl(key: string, ttlSeconds: number): Promise<string | null> {
    return getSignedUrl(
      this.client,
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      { expiresIn: ttlSeconds },
    );
  }
}

/** 判定「对象不存在」：S3 返回 NoSuchKey，部分兼容端点仅给 404 状态码。 */
function isObjectNotFound(err: unknown): boolean {
  if (typeof err !== 'object' || err === null)
    return false;
  const named = err as { name?: string; $metadata?: { httpStatusCode?: number } };
  return named.name === 'NoSuchKey' || named.$metadata?.httpStatusCode === 404;
}
