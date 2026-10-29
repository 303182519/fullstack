import { createRouter } from '@tanstack/react-router';
import { setRouter } from './router-ref';
import { routeTree } from './routeTree.gen';

/**
 * 阶段 1：router 创建。
 * context 暂时空对象——阶段 2 由 RouterProvider 动态注入 auth + queryClient。
 */
export const router = createRouter({
  routeTree,
  context: {},
  // 子路由未命中时，404 冒泡到根路由的 not-found 处理
  notFoundMode: 'root',
  // 列表页进入详情再返回时，自动恢复滚动位置
  scrollRestoration: true,
  // 鼠标悬停 Link 时提前预加载目标路由，点击时几乎零延迟
  defaultPreload: 'intent',
  // pending spinner 延迟 10ms 出现（避免快速请求闪烁）
  defaultPendingMs: 10,
  // pending spinner 至少展示 1000ms（避免一闪而过的视觉抖动）
  defaultPendingMinMs: 1000,
});

export type RouterConfig = typeof router;

// 注册运行时引用，供 router-ref.ts 的 getRouter() 使用
setRouter(router);

declare module '@tanstack/react-router' {
  interface Register {
    router: RouterConfig;
  }

  // 扩展 route.staticData 的 Meta 类型（阶段 2+ 用于 RBAC / 菜单 / 图标等）
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface StaticDataRouteOption {}
}
