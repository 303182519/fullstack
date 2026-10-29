import { createFileRoute, Link } from '@tanstack/react-router';

/**
 * 后台首页占位。阶段 3 接入真实布局壳和仪表盘。
 */
export const Route = createFileRoute('/(admin)/home/')({
  component: HomePage,
});

function HomePage() {
  return (
    <div style={{ padding: 48 }}>
      <h1>后台首页</h1>
      <p style={{ color: '#888' }}>阶段 1 占位 — 阶段 3 接入布局壳</p>
      <div style={{ marginTop: 16 }}>
        <Link to="/login">去登录页</Link>
      </div>
    </div>
  );
}
