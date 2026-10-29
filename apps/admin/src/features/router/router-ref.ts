import type { RouterConfig } from './index';

/**
 * Router 实例的运行时引用。
 *
 * 目的：切断 adapter → router 的加载期循环依赖。
 * adapter.ts 等非路由模块需要在运行时调用 router.navigate() 做登录跳转，
 * 如果静态 import router/index.ts 会在模块求值阶段形成环：
 *   adapter → router/index → routeTree.gen → 路由模块 → authStore → request → adapter
 *
 * 本文件只做运行时存取，零 import 路由树/Store/Service，是环上的安全节点。
 */
let routerRef: RouterConfig | null = null;

/** router 创建完成后注册实例（由 ./index 调用）。 */
export function setRouter(router: RouterConfig) {
  routerRef = router;
}

/** 运行时获取 router 实例，未初始化时抛错以便尽早发现问题。 */
export function getRouter(): RouterConfig {
  if (!routerRef) {
    throw new Error('[router-ref] router 尚未初始化，请确认在使用前已加载 @/features/router');
  }
  return routerRef;
}
