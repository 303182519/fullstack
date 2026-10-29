import { RouterProvider as TanStackRouterProvider } from '@tanstack/react-router';
import { memo } from 'react';
import { router } from './index';

/**
 * 阶段 1：RouterProvider 壳。
 *
 * 当前 context 只传 router 实例，auth + queryClient 等动态 context
 * 将在阶段 2 接入 useAuth() hook 后注入。
 *
 * 设计选择（对齐 Skyroc admin-example）：
 *   让 context 来自 React 组件树（D2 动态方案），
 *   而非静态写进 createRouter + 手动 router.update。
 *   原因：登录状态变化时 context 自动同步，无需在 authStore.subscribe 里维护两份状态。
 */
const RouterProvider = memo(() => {
  return <TanStackRouterProvider router={router} />;
});

export default RouterProvider;
