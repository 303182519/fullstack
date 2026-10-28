import { setupTheme } from '@shell/theme';
import { ErrorBoundary as FallbackRender } from '@shell/ui/antd';
import { createRoot } from 'react-dom/client';
import { ErrorBoundary } from 'react-error-boundary';

import App from './App';
import '../../plugins/assets';

async function setupApp() {
  const container = document.getElementById('root');

  if (!container)
    return false;

  /**
   * 主题初始化（模块级别，仅执行一次）
   *
   * 在任何组件读取主题 atom 之前完成： - 默认配置加载 - localStorage 缓存读取（生产环境） - 版本覆盖检测
   */
  setupTheme({
    buildTime: BUILD_TIME,
    isProd: import.meta.env.PUBLIC_ENV === 'production',
  });

  const root = createRoot(container);
  root.render(
    <ErrorBoundary FallbackComponent={FallbackRender}>
      <App />
    </ErrorBoundary>,
  );
  return true;
}

setupApp();
