import { ConfigService } from '@nestjs/config';
import { getConfig } from '@/config/configuration.js';
/**
 * 创建 Pino 日志配置
 * 支持 Request ID 追踪、多租户上下文、敏感数据脱敏
 */
export function createPinoConfig(
  configService: ConfigService
) {
  const loggerConfig = getConfig(configService).logger || {};	

  return {
		pinoHttp: {
			level: loggerConfig.level,
		}
	}
}