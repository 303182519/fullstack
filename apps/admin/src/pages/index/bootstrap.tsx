/* eslint-disable react-refresh/only-export-components */
import type { FallbackProps } from 'react-error-boundary';
import { createRoot } from 'react-dom/client';
import { ErrorBoundary } from 'react-error-boundary';

import App from './App';
import '../../plugins/assets';

/**
 * 阶段 0 基线占位：错误降级 UI。
 * 阶段 3/4 将接入 @shell/ui/antd 的 ErrorBoundary 与主题系统。
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
      <App />
    </ErrorBoundary>,
  );
  return true;
}

setupApp();
