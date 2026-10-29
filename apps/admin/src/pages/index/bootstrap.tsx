import type { FallbackProps } from 'react-error-boundary';
import { RouterProvider } from '@tanstack/react-router';
import { createRoot } from 'react-dom/client';
import { ErrorBoundary } from 'react-error-boundary';

import { router } from '../../router';
import '../../plugins/assets';

/**
 * 阶段 1：TanStack Router 骨架接入。
 * ErrorBoundary 暂时保留，阶段 3/4 将接入 antd 的 ErrorBoundary 与主题系统。
 */
function ErrorFallback({ error, resetErrorBoundary }: FallbackProps) {
  const message = error instanceof Error ? error.message : String(error);
  return (
    <div style={{ padding: 24, fontFamily: 'sans-serif' }}>
      <h2>Something went wrong.</h2>
      <pre style={{ color: '#c00', whiteSpace: 'pre-wrap' }}>{message}</pre>
      <button type="button" onClick={resetErrorBoundary}>Try Again</button>
    </div>
  );
}

async function setupApp() {
  const container = document.getElementById('root');

  if (!container)
    return false;

  const root = createRoot(container);
  root.render(
    <ErrorBoundary FallbackComponent={ErrorFallback}>
      <RouterProvider router={router} />
    </ErrorBoundary>,
  );
  return true;
}

setupApp();
