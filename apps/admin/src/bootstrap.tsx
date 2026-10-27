import { ErrorBoundary as FallbackRender } from '@shell/ui/antd';
import { createRoot } from 'react-dom/client';
import { ErrorBoundary } from 'react-error-boundary';

import App from './App';

async function setupApp() {
  const container = document.getElementById('root');

  if (!container)
    return false;

  const root = createRoot(container);
  root.render(
    <ErrorBoundary FallbackComponent={FallbackRender}>
      <App />
    </ErrorBoundary>,
  );
  return true;
}

setupApp();
