import { createRootRoute, Outlet } from '@tanstack/react-router';

import { restoreSession } from '@/service/api/auth';
import { useAuthStore } from '@/store/auth';

/**
 * 根路由：应用壳。
 *
 * beforeLoad 在所有子路由之前执行：页面刷新后内存里的 accessToken 丢失，
 * 趁路由解析前用 HttpOnly Cookie 静默续签一次，用户无感。
 * 失败不在这里跳转（/login 也挂在根路由下，会自指），由 (admin) 布局守卫接管。
 *
 * 登出后跳转 /login 时 accessToken 已被清空，但此时 refresh cookie 也已被服务端销毁，
 * 再跑 restoreSession 只会多打一次必败的 /auth/refresh。所以目标是 /login 时跳过续签。
 */
export const Route = createRootRoute({
  beforeLoad: async ({ location }) => {
    if (!useAuthStore.getState().accessToken && !location.pathname.startsWith('/login')) {
      await restoreSession();
    }
  },
  component: () => <Outlet />,
});
