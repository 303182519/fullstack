import { createFileRoute, Link } from '@tanstack/react-router';

export const Route = createFileRoute('/403')({
  component: ForbiddenPage,
});

function ForbiddenPage() {
  return (
    <div style={{ padding: 48, textAlign: 'center', minHeight: '100vh' }}>
      <h1>403</h1>
      <p>无权限访问</p>
      <Link to="/home">返回首页</Link>
    </div>
  );
}
