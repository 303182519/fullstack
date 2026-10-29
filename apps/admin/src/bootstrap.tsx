import type { FallbackProps } from 'react-error-boundary';
import { createRoot } from 'react-dom/client';
import { ErrorBoundary } from 'react-error-boundary';

import RouterProvider from '@/features/router/RouterProvider';
import './plugins/assets';

/**
 * 应用启动壳：ErrorBoundary + RouterProvider。
 * 阶段 2 会在此层包 QueryClientProvider / ThemeProvider。
 */
function ErrorFallback({ error, resetErrorBoundary }: FallbackProps) {
  const message = error instanceof Error ? error.message : String(error);
  return (
    <div style={{ padding: 24, fontFamily: 'sans-serif' }}>
      <h2>Something went wrong.</h2>
      <pre style={{ color: '#c00', whiteSpace: 'pre-wrap' }}>{message}</pre>
      <button type="button" onClick={resetErrorBoundary}>
        Try Again
      </button>
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
      <RouterProvider />
    </ErrorBoundary>,
  );
  return true;
}

setupApp();
