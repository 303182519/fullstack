import { createFileRoute, Outlet } from '@tanstack/react-router';

/**
 * (admin) 分组布局：后台管理壳。
 * 阶段 3 接入真实的侧边栏 / 顶栏 / 标签页 Keep-Alive。
 */
export const Route = createFileRoute('/(admin)')({
  component: AdminLayout,
});

function AdminLayout() {
  return (
    <div style={{ minHeight: '100vh', background: '#f5f7fa' }}>
      <Outlet />
    </div>
  );
}
