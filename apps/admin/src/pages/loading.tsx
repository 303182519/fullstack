/**
 * 全局 Suspense loading 组件。
 * TanStack Router 在路由懒加载期间自动展示此组件。
 */
export default function Loading() {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <span style={{ color: '#888' }}>加载中...</span>
    </div>
  );
}
