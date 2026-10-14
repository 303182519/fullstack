import type { ClsService } from 'nestjs-cls';
import type { Params } from 'nestjs-pino';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { AppClsStore } from '@/common/context/cls-store.js';
import { ConfigService } from '@nestjs/config';
import { stdSerializers } from 'pino';
import { resolveRequestId } from '@/common/request-id.js';
import { getConfig } from '@/config/configuration.js';
import { sanitizeUrl } from './log-sanitizer.js';

/** 健康探针路径：不进访问日志（会被高频调用，日志量没价值） */
const HEALTH_PATHS = new Set([
  '/api/health',
  '/api/health/ready',
  '/health',
  '/health/ready',
]);

function isHealthProbe(url: string | undefined): boolean {
  if (!url)
    return false;
  const pathname = (url.split('?')[0] ?? '').replace(/\/+$/, '') || '/';
  return HEALTH_PATHS.has(pathname);
}

/**
 * 是否流式响应（SSE）。
 *
 * 为什么必须单独判定：SSE 的 `responseTime` 是「连接生命周期时长」而不是「服务端处理耗时」——
 * 客户端按设计长期挂着连接（直到任务进入终态或主动断开），因此每次结束都必然超过
 * `LOG_SLOW_REQUEST_THRESHOLD` 而被标 `[SLOW]`，把真正的慢请求彻底淹没
 * （踩坑案例：`GET /api/jobs/:id/events` 正常断开也报 200 + `[SLOW]`）。
 *
 * 按响应头判定而不是硬编码路径：新增 SSE 端点只要正常设置 `Content-Type: text/event-stream`
 * 即自动生效；`res.getHeader` 在响应结束（finish / close）时仍可读到已发送的头。
 */
function isEventStreamResponse(res: ServerResponse): boolean {
  const contentType = res.getHeader('content-type');
  if (contentType === undefined)
    return false;
  const value = Array.isArray(contentType)
    ? contentType.join(';')
    : String(contentType);
  return value.toLowerCase().includes('text/event-stream');
}

interface NormalizedRequest {
  method?: string;
  url?: string;
  headers?: Record<string, string | string[] | undefined>;
}

/**
 * 创建 Pino 日志配置
 * 支持 Request ID 追踪、多租户上下文、敏感数据脱敏
 */
export function createPinoConfig(
  configService: ConfigService,
  cls: ClsService<AppClsStore>,
): Params {
  const loggerConfig = getConfig(configService).logger || {};
  const wantConsole = loggerConfig.output === 'console';
  const wantFile = loggerConfig.output === 'file';
  const targets: any[] = [];

  if (wantConsole) {
    // if (IsDev) {
    //   targets.push({
    //     target: 'pino-pretty',
    //     options: {
    //       colorize: true,
    //       translateTime: 'SYS:standard',
    //       ignore: 'pid,hostname',
    //     },
    //   });
    // } else {
    targets.push({ target: 'pino/file', options: { destination: 1 } });
    // }
  }

  if (wantFile) {
    const logDir = loggerConfig.logDir;
    // 经 @nestjs/config 的 Joi 校验回写后，process.env 中的数值字段会变成字符串，
    // 而 pino-roll 的 limit.count 严格要求 number，因此这里强制 Number() 转换。
    // maxFiles <= 0 表示不限制保留数量：此时不能传 limit.count = 0（那会删空轮转文件）
    const maxFilesCount = Number(loggerConfig.maxFiles);
    const limit = maxFilesCount > 0 ? { count: maxFilesCount } : undefined;

    // 主日志：全级别
    targets.push({
      target: 'pino-roll',
      options: {
        file: `${logDir}/app`,
        size: loggerConfig.maxFileSize,
        extension: '.log',
        mkdir: true,
        limit,
      },
    });

    // 错误日志单独落盘：level 必须写在 target 层，写进 options 会被忽略
    targets.push({
      target: 'pino-roll',
      level: 'error',
      options: {
        file: `${logDir}/error`,
        size: loggerConfig.maxFileSize,
        extension: '.log',
        mkdir: true,
        limit,
      },
    });
  }

  // 兜底：output 配置异常导致没有任何输出目标时，至少写 stdout
  if (targets.length === 0) {
    targets.push({ target: 'pino/file', options: { destination: 1 } });
  }

  return {
    pinoHttp: {
      level: loggerConfig.level,
      redact: {
        paths: [
          '*.headers.authorization',
          '*.headers.cookie',
          '*.headers["set-cookie"]',
          '*.password',
          '*.passwd',
          '*.secret',
          '*.token',
          '*.accessToken',
          '*.refreshToken',
          '*.apiKey',
        ],
        censor: '[REDACTED]',
      },
      // 自动记录请求
      autoLogging: {
        // 排除的路径
        ignore: (req: IncomingMessage): boolean => isHealthProbe(req.url),
      },
      transport: { targets },
      // 自定义属性键名
      customAttributeKeys: {
        req: 'request',
        res: 'response',
        err: 'error',
        responseTime: 'responseTime',
        // 决定 quietReqLogger 创建的 child 用哪个键名绑定 requestId
        // （pino-http 默认是 'reqId'）。字段契约要求顶层只出现 `requestId`，故对齐为同名。
        reqId: 'requestId',
      },
      genReqId: (req: IncomingMessage) => resolveRequestId(req),
      quietReqLogger: true,
      serializers: {
        req: (req: NormalizedRequest) => {
          const headers = req.headers ?? {};
          return {
            method: req.method,
            url: sanitizeUrl(req.url ?? ''),
            headers: {
              userAgent: headers['user-agent'],
              contentType: headers['content-type'],
              tenantId: headers['x-tenant-id'],
            },
          };
        },
        res: (res: ServerResponse) => ({
          statusCode: res.statusCode,
        }),
        // pino 默认不序列化 Error 实例：不注册时 `{ err: exception }` 会落成 `{}`，
        // message / stack 全部丢失（全局异常过滤器正是靠它记录 5xx 堆栈）。
        // pino-http 只会把 errKey（按 customAttributeKeys 为 'error'）写进 serializers，
        // 不会占用 'err' 键，因此这里注册 'err' 与访问日志的 'error' 互不干扰。
        err: stdSerializers.err,
      },
      // 5xx=error、4xx=warn、其余=info。
      // 注意：customLogLevel 会同时被「请求到达」和「响应结束」两个时点调用，
      // 这里之所以能只按响应结束时序判断，正是因为上面没有开启「请求到达」日志。
      // 若将来要重新引入到达日志，必须重新区分两个时点，否则到达日志会被判成 warn。
      customLogLevel: (
        _req: IncomingMessage,
        res: ServerResponse,
        error?: Error,
      ) => {
        if (error || res.statusCode >= 500)
          return 'error';
        if (res.statusCode >= 400)
          return 'warn';
        // 响应未正常结束 = 连接被客户端中断 / 超时，升到 warn 便于排查
        if (!res.writableEnded)
          return 'warn';
        return 'info';
      },
      customSuccessMessage: (
        req: IncomingMessage,
        res: ServerResponse,
        responseTime: number,
      ) => {
        // 流式响应（SSE）不参与慢请求判定：它的 responseTime 是连接时长而非处理耗时，
        // 否则每次正常断开都会产出 [SLOW]，把慢请求告警淹没（见 isEventStreamResponse）。
        const slow
          = !isEventStreamResponse(res)
            && responseTime > loggerConfig.slowRequestThreshold;
        const suffix = slow ? ' [SLOW]' : '';
        return `HTTP ${req.method} ${sanitizeUrl(req.url ?? '')} ${res.statusCode} - ${responseTime}ms${suffix}`;
      },
      customErrorMessage: (
        req: IncomingMessage,
        res: ServerResponse,
        error: Error,
      ) => {
        return `HTTP ${req.method} ${sanitizeUrl(req.url ?? '')} ${res.statusCode} - ERROR: ${error.message}`;
      },
      mixin: () => {
        // 请求级字段（requestId / bizCode）现在统一存放在 nestjs-cls 的 CLS store 里
        // （ADR-005 迁移后不再有独立的 request-context.ts）。mixin 在无请求上下文时
        // （启动日志、定时任务等）也必须安全：先判 isActive，避免读到未建立的上下文。
        const props: Record<string, string> = {};
        if (cls.isActive()) {
          const requestId = cls.getId();
          if (requestId)
            props.requestId = requestId;
          const bizCode = cls.get('bizCode');
          if (bizCode)
            props.bizCode = bizCode;
        }
        return props;
      },
    },
  };
}
