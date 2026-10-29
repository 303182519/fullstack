import type { ErrorComponentProps } from '@tanstack/react-router';

/**
 * 全局错误边界约定文件。
 * 被 routeFileIgnorePattern 从路由树排除，由 TanStack Router 运行时自动发现并用作错误 UI。
 * 任何子路由抛错都会冒泡到此组件。
 */
export default function ErrorPage({ error, reset }: ErrorComponentProps) {
  const message = error instanceof Error ? error.message : String(error);
  return (
    <div style={{ padding: 48, textAlign: 'center', minHeight: '100vh' }}>
      <h1>出错了</h1>
      <p style={{ color: '#c00', whiteSpace: 'pre-wrap' }}>{message}</p>
      <button type="button" onClick={reset} style={{ marginTop: 16 }}>
        重试
      </button>
    </div>
  );
}
