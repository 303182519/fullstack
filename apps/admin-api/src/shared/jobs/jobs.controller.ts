import { PERMISSIONS } from '@fedstack/auth-core';
import { Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequirePermission } from '@/common/decorators/index.js';
import { ParseSnowflakePipe } from '@/common/pipes/parse-snowflake.pipe.js';
import { QueryJobDto } from './dto/query-job.dto.js';
import { JobService } from './services/job.service.js';

/**
 * 任务监控（P3b）：异步任务中心的只读查询 + 运维操作。
 *
 * 作用域（ADR-009 租户隔离，由 ScopeResolverService 强制保证）：
 *   - 租户管理员：强制本租户 + 平台级任务可见，忽略客户端 tenantId 参数；
 *   - 平台超管：默认全量视图，显式传 `?tenantId=` 时代管该租户。
 *
 * 注意路由注册顺序：`dead-letters` 必须排在 `:id` 之前，
 * 否则会被 `:id` 参数路由优先吞掉。
 */
@ApiTags('任务监控')
@ApiBearerAuth()
@Controller('jobs')
export class JobsController {
  constructor(private readonly jobService: JobService) {}

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
      undefined,
      delegatedTenantId,
    );
  }

  @Get(':id')
  @RequirePermission(PERMISSIONS.MONITOR.JOB.QUERY)
  @ApiOperation({ summary: '任务详情' })
  async detail(@Param('id', ParseSnowflakePipe) id: bigint) {
    return this.jobService.findById(id.toString());
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @RequirePermission(PERMISSIONS.MONITOR.JOB.EDIT)
  @ApiOperation({ summary: '取消任务（仅 queued/delayed 可拦截，已被 worker 抢占返回 409）' })
  async cancel(@Param('id', ParseSnowflakePipe) id: bigint) {
    return this.jobService.cancel(id.toString());
  }

  @Post(':id/compensate')
  @HttpCode(HttpStatus.OK)
  @RequirePermission(PERMISSIONS.MONITOR.JOB.EDIT)
  @ApiOperation({ summary: '死信补偿（BullMQ 仍在则不干预返回 null，丢失则重新入队）' })
  async compensate(@Param('id', ParseSnowflakePipe) id: bigint) {
    return this.jobService.compensate(id.toString());
  }
}
