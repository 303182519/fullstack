import type { ClsStore } from 'nestjs-cls';
import type { AuthPrincipal } from '@/shared/auth/auth.types.js';

/**
 * 缓存命中状态：X-Cache 响应头的取值。
 */
export type CacheState = 'HIT' | 'MISS' | 'BYPASS';

/**
 * 应用级 CLS store 形状（nestjs-cls 的强类型 store）。
 *
 * 迁移前这里有两份彼此独立的 AsyncLocalStorage：请求级 store（cache / cacheKey /
 * requestId / bizCode）与用户上下文（User）。迁移后统一为 nestjs-cls 的单一 store，
 * 两类状态共存于同一个请求上下文，故合并声明在此。
 * 例外：requestId 不在此 store 里另设字符串 key —— 它由 ClsMiddleware 的
 * generateId/idGenerator 存入 CLS_ID，统一经 `ClsService.getId()`
 */
export interface AppClsStore extends ClsStore {
  /**
   * 请求级业务码。异常过滤器在拒绝 / 失败请求时写入，由 pino mixin 注入访问日志顶层。
   */
  bizCode?: string;
  /** 缓存命中状态。service 写入，CacheHeaderInterceptor 读出后写成 X-Cache 响应头。 */
  cache?: CacheState;
  /** 命中的缓存 key（当前仅记录，不对外输出）。 */
  cacheKey?: string;
  /** 当前请求的登录主体。由 JwtAuthGuard 校验通过后写入（与 request.user 为同一对象引用）。 */
  user?: AuthPrincipal;
}
