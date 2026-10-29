import { createFileRoute, Link } from '@tanstack/react-router';

/**
 * Splat route: 捕获所有未匹配路径，作为 404 页面。
 * 文件名为 `$.tsx` 才会被识别为 catch-all。
 */
export const Route = createFileRoute('/$')({
  component: NotFoundPage,
});

function NotFoundPage() {
  return (
    <div style={{ padding: 48, textAlign: 'center', minHeight: '100vh' }}>
      <h1>404</h1>
      <p>页面不存在</p>
      <Link to="/home">返回首页</Link>
    </div>
  );
}
