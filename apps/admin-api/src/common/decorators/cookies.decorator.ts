import type { ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import { createParamDecorator } from '@nestjs/common';

/**
 * 从请求中取出某个 Cookie 值。
 *
 * 用法：`@Cookie('refresh_token') refreshToken: string | undefined`
 *
 * 前置条件：CommonModule 已在全局注册 `cookieParser()`（cookie-parser 依赖），
 * 否则 `request.cookies` 为 undefined、本装饰器恒返回 undefined。
 */
export const Cookie = createParamDecorator(
  (key: string, ctx: ExecutionContext): string | undefined => {
    const request = ctx.switchToHttp().getRequest<Request>();
    return request.cookies?.[key];
  },
);

/**
 * 从请求中取出全部 Cookie。
 *
 * 用法：`@Cookies() cookies: Record<string, string>`
 *
 * 注意：cookie-parser 解析出来的 value 类型固定为 `string | undefined`（缺失键时 undefined），
 * 本装饰器返回类型放宽为 `Record<string, string>` 是为了让调用处使用时不必再手动断言；
 * 若要逐个读取且关心缺省态，优先使用 `@Cookie(key)`。
 */
export const Cookies = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): Record<string, string> => {
    const request = ctx.switchToHttp().getRequest<Request>();
    return (request.cookies ?? {}) as Record<string, string>;
  },
);
