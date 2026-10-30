import type { FallbackProps } from 'react-error-boundary';
import { createRoot } from 'react-dom/client';
import { ErrorBoundary } from 'react-error-boundary';

import App from '@/App';
import './plugins/assets';

/**
 * 应用启动壳：副作用（assets）、根级 ErrorBoundary、createRoot。
 * Provider 串联见 App.tsx。
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
      <App />
    </ErrorBoundary>,
  );
  return true;
}

setupApp();
