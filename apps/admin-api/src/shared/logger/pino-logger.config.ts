import { ConfigService } from '@nestjs/config';
import type { Params } from 'nestjs-pino';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { getConfig } from '@/config/configuration.js';
import { IsDev } from '@/common/constants/environment.js';
import { resolveRequestId } from '@/common/request-id.js';
import { getRequestContext } from '@/common/request-context.js';
import { stdSerializers, type DestinationStream } from 'pino';
import { sanitizeUrl } from './log-sanitizer.js';

/** 健康探针路径：不进访问日志（会被高频调用，日志量没价值） */
const HEALTH_PATHS = new Set([
  '/api/health',
  '/api/health/ready',
  '/health',
  '/health/ready',
]);

function isHealthProbe(url: string | undefined): boolean {
  if (!url) return false;
  const pathname = (url.split('?')[0] ?? '').replace(/\/+$/, '') || '/';
  return HEALTH_PATHS.has(pathname);
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
  configService: ConfigService
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
		//}
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
			mixin: ()=> {
				const { requestId, bizCode } = getRequestContext();
				const props: Record<string, string> = {};
				if (requestId) props.requestId = requestId;
				if (bizCode) props.bizCode = bizCode;
				return props;
			},
		}
	}
}