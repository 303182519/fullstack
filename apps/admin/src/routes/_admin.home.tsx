import { createFileRoute, Link } from '@tanstack/react-router';

export const Route = createFileRoute('/_admin/home')({
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
