import { SetMetadata } from '@nestjs/common';

/** 操作日志元数据 key：由全局 OperLogInterceptor 读取 */
export const OPER_LOG_KEY = 'oper_log';

/** @OperLog 装饰器入参：module/action 仅为展示与检索维度，不含业务逻辑 */
export interface OperLogMeta {
  /** 业务模块名，如「用户管理」 */
  module: string;
  /** 动作名，如「创建用户」 */
  action: string;
}

/**
 * 声明端点的操作日志元数据，如
 * `@OperLog({ module: '用户管理', action: '创建用户' })`。
 *
 * 语义（见 ADR-009）：
 * - 全局 OperLogInterceptor 在**处理完成之后**异步落库（成功记响应、失败记错误），
 *   落库失败仅告警，绝不影响业务响应；
 * - 请求参数先做敏感字段掩码（password / captchaText 等），响应结果截断至 2KB；
 * - 未标注本装饰器的端点不记操作日志（认证类端点由登录日志承载）；
 * - 本装饰器只声明「记什么」，不承担任何鉴权职责。
 */
export const OperLog = (meta: OperLogMeta) => SetMetadata(OPER_LOG_KEY, meta);
