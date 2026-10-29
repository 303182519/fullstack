import { createFileRoute, Outlet } from '@tanstack/react-router';

/**
 * (auth) 分组布局：认证流程的统一外壳（居中卡片容器）。
 * 带括号的目录不产生 URL 段，只用于组织布局嵌套。
 */
export const Route = createFileRoute('/(auth)')({
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
