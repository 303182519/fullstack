/**
 * 根级 404 约定文件。
 * 配合 notFoundMode: 'root'，所有子路由的 404 都会冒泡到此组件。
 * 被 routeFileIgnorePattern 从路由树排除，由 TanStack Router 运行时自动发现。
 */
export default function NotFound() {
  return (
    <div style={{ padding: 48, textAlign: 'center', minHeight: '100vh' }}>
      <h1>404</h1>
      <p>页面不存在</p>
    </div>
  );
}
