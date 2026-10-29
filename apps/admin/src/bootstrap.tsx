import type { FallbackProps } from 'react-error-boundary';
import { QueryClientProvider } from '@tanstack/react-query';
import { App as AntdApp } from 'antd';
import { useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { ErrorBoundary } from 'react-error-boundary';

import RouterProvider from '@/features/router/RouterProvider';
import { registerAntdApis } from '@/service/antd-holder';
import { queryClient } from '@/service/queryClient';
import './plugins/assets';

/**
 * 应用启动壳：ErrorBoundary + AntdApp（message/modal context）+ QueryClientProvider + RouterProvider。
 */

/**
 * 把 App.useApp() 的 message / modal 实例注册到 service 层。
 * adapter 是纯 ts 模块，进不了 React 树，靠这个组件桥接。
 */
function AntdApiRegistrar() {
  const { message, modal } = AntdApp.useApp();
  useEffect(() => {
    registerAntdApis(message, modal);
  }, [message, modal]);
  return null;
}

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
      <AntdApp>
        <AntdApiRegistrar />
        <QueryClientProvider client={queryClient}>
          <RouterProvider />
        </QueryClientProvider>
      </AntdApp>
    </ErrorBoundary>,
  );
  return true;
}

setupApp();
