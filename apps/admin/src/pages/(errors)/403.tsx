import { createFileRoute, Link } from '@tanstack/react-router';

/** 403 无权限页面。阶段 5 做 RBAC 时由 guard 跳转到此。 */
export const Route = createFileRoute('/(errors)/403')({
  component: ForbiddenPage,
});

function ForbiddenPage() {
  return (
    <div style={{ padding: 48, textAlign: 'center', minHeight: '100vh' }}>
      <h1>403</h1>
      <p>没有访问权限</p>
      <Link to="/home">返回首页</Link>
    </div>
  );
}
