import type { AuthPrincipal } from '@/shared/auth/auth.types.js';
import { PERMISSIONS } from '@fedstack/auth-core';
import {
  Controller,
  Delete,
  Get,
  HttpException,
  HttpStatus,
  Logger,
  Optional,
  Param,
  ParseBoolPipe,
  Post,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { memoryStorage } from 'multer';
import { CurrentUser, RequirePermission } from '@/common/decorators/index.js';
import { badRequest } from '@/common/exceptions/business.exception.js';
import { ParseSnowflakePipe } from '@/common/pipes/parse-snowflake.pipe.js';
import { OperLog } from '@/shared/audit/oper-log.decorator.js';
import { FileResponseDto, QueryFileDto } from './dto/index.js';
import { FileService } from './file.service.js';

/**
 * Multer 硬上限配置（模块加载时从 env 直读）。
 *
 * 背景：NestJS 装饰器参数在类定义时求值，无法访问实例属性；
 * 而 ConfigService 是运行时注入的。因此这里用 `process.env` 直读，
 * 与 env.validation.ts 中登记的 UPLOAD_* 环境变量保持一致。
 *
 * MIME 白名单 / 分类大小上限等**业务校验**全部在 FileService 做——
 * Multer 只负责：memoryStorage + 总硬上限（超过即 LIMIT_FILE_SIZE 直接拒绝）。
 */
const UPLOAD_MAX_BYTES = Number(process.env.UPLOAD_MAX_BYTES ?? '5242880');
const UPLOAD_MAX_BYTES_OTHER = Number(
  process.env.UPLOAD_MAX_BYTES_OTHER ?? '20971520',
);
const MULTER_HARD_CEILING = Math.max(UPLOAD_MAX_BYTES, UPLOAD_MAX_BYTES_OTHER);

const MULTER_OPTS = {
  storage: memoryStorage(),
  limits: {
    fileSize: MULTER_HARD_CEILING,
    files: 1,
  },
};

/**
 * 文件控制器（P3a，ADR-012）。
 *
 * 端点概览：
 * | 方法  | 路径               | 能力                                    | 限流   | 审计 |
 * | ----- | ------------------ | --------------------------------------- | ------ | ---- |
 * | POST  | /files             | 上传（multipart）                       | 20/min | ✅   |
 * | GET   | /files             | 分页列表                                | —      | —    |
 * | GET   | /files/:id         | 详情                                    | —      | —    |
 * | DELETE| /files/:id         | 删除（软删元数据 + 物理删 best-effort） | —      | ✅   |
 * | GET   | /files/:id/content | 下载（代理 / 直连签名）                 | —      | —    |
 */
@ApiTags('系统文件')
@ApiBearerAuth()
@Controller('files')
export class FileController {
  private readonly logger = new Logger(FileController.name);

  constructor(private readonly fileService: FileService) {}

  @Post()
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    description: '上传文件',
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
        module: {
          type: 'string',
          nullable: true,
          description: '业务归属标记（可选，如 avatar / notice）',
        },
      },
    },
  })
  @ApiOperation({ summary: '上传文件' })
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @RequirePermission(PERMISSIONS.SYSTEM.FILE.ADD)
  @OperLog({ module: '文件', action: '上传文件' })
  @UseInterceptors(FileInterceptor('file', MULTER_OPTS))
  async upload(
    @CurrentUser() principal: AuthPrincipal,
    @UploadedFile() file: Express.Multer.File,
    @Query('module') @Optional() moduleTag?: string,
  ): Promise<FileResponseDto> {
    if (!file)
      throw badRequest('缺少 file 字段', '10A02');

    return this.fileService.upload(principal, file, moduleTag);
  }

  @Get()
  @ApiOperation({ summary: '文件列表（分页）' })
  @RequirePermission(PERMISSIONS.SYSTEM.FILE.QUERY)
  async list(
    @CurrentUser() principal: AuthPrincipal,
    @Query() query: QueryFileDto,
  ) {
    return this.fileService.list(principal, query);
  }

  @Get(':id')
  @ApiOperation({ summary: '文件详情' })
  @ApiParam({ name: 'id', description: '文件雪花 ID' })
  @RequirePermission(PERMISSIONS.SYSTEM.FILE.QUERY)
  async detail(
    @CurrentUser() principal: AuthPrincipal,
    @Param('id', ParseSnowflakePipe) id: bigint,
  ): Promise<FileResponseDto> {
    return this.fileService.detail(principal, id);
  }

  @Delete(':id')
  @ApiOperation({ summary: '删除文件' })
  @ApiParam({ name: 'id', description: '文件雪花 ID' })
  @RequirePermission(PERMISSIONS.SYSTEM.FILE.REMOVE)
  @OperLog({ module: '文件', action: '删除文件' })
  async remove(
    @CurrentUser() principal: AuthPrincipal,
    @Param('id', ParseSnowflakePipe) id: bigint,
  ): Promise<{ success: boolean }> {
    await this.fileService.remove(principal, id);
    return { success: true };
  }

  /**
   * 下载（代理流 / 预签名直连）。
   *
   * - 默认代理：Content-Type + Content-Disposition + 流式 pipe；
   * - direct=true：返回 `{ url, mimeType, filename }`，驱动不支持直连（local）时 400。
   */
  @Get(':id/content')
  @ApiOperation({ summary: '下载内容（代理流式 / 直连签名）' })
  @ApiParam({ name: 'id', description: '文件雪花 ID' })
  @ApiQuery({
    name: 'direct',
    description: '是否直连（true 返回预签名 URL）',
    required: false,
  })
  @RequirePermission(PERMISSIONS.SYSTEM.FILE.DOWNLOAD)
  async download(
    @CurrentUser() principal: AuthPrincipal,
    @Param('id', ParseSnowflakePipe) id: bigint,
    @Query('direct', ParseBoolPipe) direct = false,
    @Res() res: import('express').Response,
  ) {
    const result = await this.fileService.content(principal, id, direct);

    if (direct) {
      if (!result)
        throw badRequest('当前驱动不支持直连下载，请改用代理下载', '10A05');
      return result;
    }

    if (!result || !('stream' in result)) {
      throw new HttpException('非法下载结果', HttpStatus.INTERNAL_SERVER_ERROR);
    }

    const { stream, mimeType, originalName } = result;
    res.setHeader('Content-Type', mimeType);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(originalName)}"`,
    );
    stream.pipe(res);
  }
}
