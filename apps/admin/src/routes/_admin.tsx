import { createFileRoute, Outlet } from '@tanstack/react-router';

/**
 * Pathless 布局（下划线前缀不产生 URL 段）。
 */
export const Route = createFileRoute('/_admin')({
  component: AdminLayout,
});

function AdminLayout() {
  return (
    <div style={{ minHeight: '100vh', background: '#f5f7fa' }}>
      <Outlet />
    </div>
  );
}
