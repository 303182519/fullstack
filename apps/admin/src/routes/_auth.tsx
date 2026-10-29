import { createFileRoute, Outlet } from '@tanstack/react-router';

/**
 * Pathless 布局（下划线前缀不产生 URL 段）。
 * 子路由通过 _auth.xxx.tsx 形式嵌套在此布局下。
 */
export const Route = createFileRoute('/_auth')({
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
