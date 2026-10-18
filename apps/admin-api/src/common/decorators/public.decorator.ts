import { SetMetadata } from '@nestjs/common';

/**
 * 标记路由为「公开端点」：跳过全局 JwtAuthGuard 的鉴权。
 *
 * 默认全局守卫是「拒绝优先」（未标记即需鉴权）——新端点若忘记声明，默认是安全的（需登录），
 * 而不是默认开放。仅登录、验证码刷新等无主体端点显式标注。
 */
export const IS_PUBLIC_KEY = 'isPublic';

export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
