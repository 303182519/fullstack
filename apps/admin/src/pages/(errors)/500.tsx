import { createFileRoute, Link } from '@tanstack/react-router';

/** 500 服务端错误页面。 */
export const Route = createFileRoute('/(errors)/500')({
  component: ServerErrorPage,
});

function ServerErrorPage() {
  return (
    <div style={{ padding: 48, textAlign: 'center', minHeight: '100vh' }}>
      <h1>500</h1>
      <p>服务端错误</p>
      <Link to="/home">返回首页</Link>
    </div>
  );
}
