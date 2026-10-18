import type { Request } from 'express';
import type { OperLogMeta } from './oper-log.decorator.js';
import { OperLogStatus } from '@fedstack/database';
import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable, tap } from 'rxjs';
import { RequestContextService } from '@/common/context/request-context.service.js';
import { OPER_LOG_KEY } from './oper-log.decorator.js';
import { maskSensitive, truncateResult } from './oper-log.mask.js';
import { OperLogService } from './oper-log.service.js';

/**
 * 操作日志全局拦截器（ADR-009）。
 *
 * 触发条件：路由（handler 优先于 controller）标注了 @OperLog 元数据，否则直通。
 * 记录时机：业务处理**完成之后**（成功或抛错都记），以 fire-and-forget 方式落库，
 * 不增加响应时延；落库失败由 OperLogService 内部吞掉并告警。
 *
 * 主体缺省处理：@OperLog 只允许出现在 JWT 保护端点上，主体理应恒存在；
 * 万一缺失（装配失误等），宁可不记也不写脏数据，warn 提示装配问题。
 */
@Injectable()
export class OperLogInterceptor implements NestInterceptor {
  private readonly logger = new Logger(OperLogInterceptor.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly operLogService: OperLogService,
    private readonly requestContext: RequestContextService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const meta = this.reflector.getAllAndOverride<OperLogMeta | undefined>(
      OPER_LOG_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!meta)
      return next.handle();

    const http = context.switchToHttp();
    const req = http.getRequest<Request>();
    const startedAt = Date.now();

    return next.handle().pipe(
      tap({
        next: (result) => {
          this.write(meta, req, startedAt, OperLogStatus.SUCCESS, result, undefined);
        },
        error: (err: unknown) => {
          this.write(meta, req, startedAt, OperLogStatus.FAILURE, undefined, err);
        },
      }),
    );
  }

  /** 组装日志条目并异步落库。本方法自身不抛、不 await。 */
  private write(
    meta: OperLogMeta,
    req: Request,
    startedAt: number,
    status: OperLogStatus,
    result: unknown,
    error: unknown,
  ): void {
    const user = this.requestContext.getUser();
    if (!user) {
      this.logger.warn(
        `操作日志缺少请求主体，跳过记录（请确认端点有 JWT 保护）: ${req.method} ${req.url}`,
      );
      return;
    }

    const params = maskSensitive({
      query: Object.keys(req.query ?? {}).length > 0 ? req.query : null,
      body: req.body && Object.keys(req.body).length > 0 ? req.body : null,
    });

    void this.operLogService.append({
      tenantId: BigInt(user.tenantId),
      userId: BigInt(user.userId),
      username: user.username,
      module: meta.module,
      action: meta.action,
      method: req.method,
      path: req.originalUrl ?? req.url,
      ip: req.ip ?? null,
      params,
      result: status === OperLogStatus.SUCCESS ? truncateResult(result) : undefined,
      status,
      errorMsg: error instanceof Error ? error.message : error ? String(error) : null,
      costMs: Date.now() - startedAt,
    });
  }
}
