import { createRootRoute, Outlet } from '@tanstack/react-router';

import { restoreSession } from '@/service/api/auth';
import { useAuthStore } from '@/store/auth';

/**
 * 根路由：应用壳。
 *
 * beforeLoad 在所有子路由之前执行：页面刷新后内存里的 accessToken 丢失，
 * 趁路由解析前用 HttpOnly Cookie 静默续签一次，用户无感。
 * 失败不在这里跳转（/login 也挂在根路由下，会自指），由 (admin) 布局守卫接管。
 */
export const Route = createRootRoute({
  beforeLoad: async () => {
    if (!useAuthStore.getState().accessToken) {
      await restoreSession();
    }
  },
  component: () => <Outlet />,
});
