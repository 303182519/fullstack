import type { Request, Response } from 'express';
import type { IJobRunView } from './types/job.types.js';
import type { AuthPrincipal } from '@/shared/auth/auth.types.js';
import type { StreamEntry } from '@/shared/sse/stream-events.service.js';
import { PERMISSIONS } from '@fedstack/auth-core';
import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  Param,
  Post,
  Query,
  Req,
  Res,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { CurrentUser, RequirePermission } from '@/common/decorators/index.js';
import { ParseSnowflakePipe } from '@/common/pipes/parse-snowflake.pipe.js';
import { extractLastEventId, formatSseEvent, writeSseHeartbeat } from '@/shared/sse/sse.util.js';
import { StreamEventsService } from '@/shared/sse/stream-events.service.js';
import { JOB_SSE_EVENT, JOB_TERMINAL_STATUSES } from './constants/job.constants.js';
import { QueryJobDto } from './dto/query-job.dto.js';
import { JobService } from './services/job.service.js';

/** 路由参数 :id 的 API 装饰器（JobsController 内部复用） */
const idParam = ApiParam({ name: 'id', description: '任务执行记录 ID（雪花 ID）' });

/** SSE 心跳间隔（ms），需小于反向代理空闲超时（Nginx 默认 60s） */
const SSE_HEARTBEAT_INTERVAL_MS = 15_000;

/** 全局并发 SSE 连接数上限（单进程）。超限抛 503，让客户端重连或退回拉取 */
const MAX_SSE_CONNECTIONS = 200;

@ApiTags('任务监控')
@ApiBearerAuth()
@Controller('jobs')
export class JobsController {
  private readonly logger = new Logger(JobsController.name);
  /** 当前活跃 SSE 连接数（进程内计数器） */
  private static activeSseConnections = 0;

  constructor(
    private readonly jobService: JobService,
    private readonly streamEvents: StreamEventsService,
  ) {}

  @Get()
  @RequirePermission(PERMISSIONS.MONITOR.JOB.QUERY)
  @ApiOperation({ summary: '任务分页查询（租户隔离由服务端 ScopeResolverService 保证）' })
  async list(
    @Query() query: QueryJobDto,
    @Query('tenantId') delegatedTenantId?: string,
  ) {
    return this.jobService.list(
      { name: query.name, status: query.status, page: query.page, pageSize: query.pageSize },
      delegatedTenantId,
    );
  }

  @Get('dead-letters')
  @RequirePermission(PERMISSIONS.MONITOR.JOB.QUERY)
  @ApiOperation({ summary: '死信任务查询（DB 卡非终态超时未推进）' })
  async deadLetters(
    @Query('timeoutMs') timeoutMs?: string,
    @Query('tenantId') delegatedTenantId?: string,
  ) {
    return this.jobService.findDeadLetters(
      timeoutMs ? Number(timeoutMs) : undefined,
      delegatedTenantId,
    );
  }

  @Get(':id')
  @RequirePermission(PERMISSIONS.MONITOR.JOB.QUERY)
  @ApiOperation({ summary: '任务详情' })
  @idParam
  async detail(@Param('id', ParseSnowflakePipe) id: bigint) {
    return this.jobService.findById(id.toString());
  }

  @Get(':id/events')
  @RequirePermission(PERMISSIONS.MONITOR.JOB.QUERY)
  @ApiOperation({ summary: '订阅单个任务事件流（SSE，支持 Last-Event-ID 断线续传）' })
  @idParam
  async getEvents(
    @Param('id', ParseSnowflakePipe) idBigInt: bigint,
    @CurrentUser() principal: AuthPrincipal,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const jobId = idBigInt.toString();

    // ── 1. 并发连接上限（同步临界区，Node 单线程保证安全） ──
    if (JobsController.activeSseConnections >= MAX_SSE_CONNECTIONS) {
      throw new ServiceUnavailableException('SSE 连接数已满，请稍后重连');
    }
    JobsController.activeSseConnections++;

    let released = false;
    const releaseConnection = () => {
      if (released)
        return;
      released = true;
      JobsController.activeSseConnections--;
    };

    // ── 2. 连接级状态（收进可变对象，teardown 需要引用它） ──
    const conn: {
      closed: boolean;
      streaming: boolean;
      pending: Array<StreamEntry<IJobRunView>>;
      heartbeat?: NodeJS.Timeout;
      abortCtrl?: AbortController;
    } = {
      closed: false,
      streaming: false,
      pending: [],
    };

    /** 唯一的、幂等的清理入口 */
    const teardown = () => {
      if (conn.closed)
        return;
      conn.closed = true;
      if (conn.heartbeat)
        clearInterval(conn.heartbeat);
      conn.pending = [];
      // 主动中止 tail 迭代器——让 XREAD BLOCK 立刻退出并清理 subscriber 连接
      conn.abortCtrl?.abort();
      releaseConnection();
      // 显式摘除监听器：避免 socket 回收前 req/res 继续持有闭包
      req.off('close', teardown);
      res.off('close', teardown);
      res.off('error', teardown);
      if (res.headersSent && !res.writableEnded && !res.destroyed) {
        try {
          res.end();
        }
        catch { /* 连接已失效 */ }
      }
    };

    /** 写入 SSE 帧。返回 false = 连接不可用，调用方必须停止推送 */
    const write = (chunk: string): boolean => {
      if (conn.closed || res.writableEnded || res.destroyed) {
        teardown();
        return false;
      }
      try {
        if (res.write(chunk)) {
          return true;
        }
      }
      catch {
        teardown();
        return false;
      }
      // 背压：客户端消费过慢，主动断开让重连后从 Last-Event-ID 续传
      this.logger.warn(`SSE 背压断开: jobId=${jobId} userId=${principal.userId}`);
      teardown();
      return false;
    };

    /**
     * 事件派发：快照下发前先进 pending 缓冲，避免较旧的快照把已推送的新状态回退。
     * 快照下发后直接 write。终态事件触发 teardown。
     */
    const dispatch = (entry: StreamEntry<IJobRunView>) => {
      if (!conn.streaming) {
        conn.pending.push(entry);
        return;
      }
      const frame = formatSseEvent({
        id: entry.id,
        event: entry.event,
        data: entry.data,
      });
      if (!write(frame))
        return;
      if (JOB_TERMINAL_STATUSES.includes(entry.data.status)) {
        teardown();
      }
    };

    // ── 3. 订阅 Stream（必须早于 DB 快照读取） ──
    // 读取快照期间 Stream 里到达的事件先进入 pending，保证快照不覆盖更晚的状态。
    const abortCtrl = new AbortController();
    conn.abortCtrl = abortCtrl;
    (async () => {
      const afterId = extractLastEventId(req.headers['last-event-id']);
      for await (const entry of this.streamEvents.createTail<IJobRunView>('job', jobId, {
        afterId,
        signal: abortCtrl.signal,
      })) {
        if (conn.closed)
          return;
        if (!entry) {
          // BLOCK 超时：无新事件，继续等待
          continue;
        }
        dispatch(entry);
        if (conn.closed)
          return;
      }
    })().catch((err) => {
      // abort 主动触发的退出不算异常，只有非 abort 原因才 warn
      if (!conn.closed) {
        this.logger.warn(`SSE tail 异常退出: jobId=${jobId} ${err instanceof Error ? err.message : String(err)}`);
        teardown();
      }
    });
    // fire-and-forget 但不 await——SSE 生命周期期间 tailPromise 独立运行

    // ── 4. DB 鉴权快照（SSE 响应头发送前，异常可正常抛 HTTP 状态码） ──
    let snapshot: IJobRunView;
    try {
      // findById 已包含租户鉴权（assertTenantAccess）
      snapshot = await this.jobService.findById(jobId);
    }
    catch (err) {
      teardown(); // headersSent=false，不会 end 响应
      if (conn.closed)
        return; // 鉴权期间客户端已断开，静默退出
      throw err;
    }
    if (conn.closed)
      return; // 鉴权期间客户端已断开

    // ── 5. 读取断线重连 backlog（XRANGE，可选） ──
    const headerLastId = extractLastEventId(req.headers['last-event-id']);
    if (headerLastId) {
      const backlog = await this.streamEvents.listBacklog<IJobRunView>('job', jobId, headerLastId);
      if (conn.closed)
        return;
      for (const entry of backlog) {
        dispatch(entry);
        if (conn.closed)
          return;
      }
    }

    // ── 6. 发送 SSE 响应头 ──
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // 关闭反向代理缓冲
    try {
      res.flushHeaders?.();
    }
    catch {
      teardown();
      return;
    }

    // ── 7. 心跳保活（注释行，EventSource 自动忽略） ──
    conn.heartbeat = setInterval(() => {
      if (!writeSseHeartbeat(res))
        teardown();
    }, SSE_HEARTBEAT_INTERVAL_MS);

    // ── 8. 客户端断连清理注册 ──
    req.on('close', teardown);
    res.on('close', teardown);
    res.on('error', teardown);

    // ── 9. 下发快照 + 回放缓冲 ──
    conn.streaming = true;

    // 快照事件：不带 id（省略 id 行使客户端 Last-Event-ID 保持最后一个数字序列号，
    // 避免 'snapshot' 这类非序列号 id 污染重连语义）
    const snapshotFrame = formatSseEvent({
      event: JOB_SSE_EVENT.SNAPSHOT,
      data: snapshot,
    });
    if (!write(snapshotFrame))
      return;

    if (JOB_TERMINAL_STATUSES.includes(snapshot.status)) {
      // 快照已是终态：终态不可逆，缓冲中更早的事件均被快照覆盖，无需回放
      teardown();
      return;
    }

    // 回放订阅期间缓冲的事件（Stream 中到达，早于快照 flushHeaders）
    const buffered = conn.pending;
    conn.pending = [];
    for (const entry of buffered) {
      if (conn.closed)
        break;
      // 跳过早于快照的缓冲事件：其状态变更已被快照读取点包含，
      // 回放会导致状态回退（如进度从 50% 倒退回 10%）。
      if (new Date(entry.data.updatedAt).getTime() <= new Date(snapshot.updatedAt).getTime())
        continue;
      dispatch(entry);
    }
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @RequirePermission(PERMISSIONS.MONITOR.JOB.EDIT)
  @ApiOperation({ summary: '取消任务（仅 queued/delayed 可拦截，已被 worker 抢占返回 409）' })
  @idParam
  async cancel(@Param('id', ParseSnowflakePipe) id: bigint) {
    return this.jobService.cancel(id.toString());
  }

  @Post(':id/compensate')
  @HttpCode(HttpStatus.OK)
  @RequirePermission(PERMISSIONS.MONITOR.JOB.EDIT)
  @ApiOperation({ summary: '死信补偿（重新入队或标记失败）' })
  @idParam
  async compensate(@Param('id', ParseSnowflakePipe) id: bigint) {
    return this.jobService.compensate(id.toString());
  }
}
