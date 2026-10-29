import { createFileRoute, Outlet, redirect } from '@tanstack/react-router';

import { useAuthStore } from '@/store/auth';

/**
 * (auth) 分组布局：认证流程的统一外壳（居中卡片容器）。
 * 带括号的目录不产生 URL 段，只用于组织布局嵌套。
 */
export const Route = createFileRoute('/(auth)')({
  beforeLoad: () => {
    // 已登录还访问登录页 → 回后台首页（根路由的静默续签先于这里执行，此时 token 是最终状态）
    if (useAuthStore.getState().accessToken) {
      throw redirect({ to: '/home' });
    }
  },
  component: AuthLayout,
});

function AuthLayout() {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#f0f2f5',
      }}
    >
      <Outlet />
    </div>
  );
}
