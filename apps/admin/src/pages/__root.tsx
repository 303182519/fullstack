import { createRootRoute, Outlet } from '@tanstack/react-router';

/**
 * 根路由：应用壳。
 * 阶段 2 在此层包 QueryClientProvider / ThemeProvider / RouterProvider。
 */
export const Route = createRootRoute({
  component: () => <Outlet />,
});
