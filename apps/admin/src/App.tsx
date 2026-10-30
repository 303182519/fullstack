import { QueryClientProvider } from '@tanstack/react-query';

import AntdProvider from '@/features/antd/AntdProvider';
import RouterProvider from '@/features/router/RouterProvider';
import { queryClient } from '@/service/queryClient';

/**
 * 应用组合层：只负责 Provider 串联与页面壳挂载。
 * 副作用初始化与 ErrorBoundary 留在 bootstrap.tsx。
 */
function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AntdProvider>
        <RouterProvider />
      </AntdProvider>
    </QueryClientProvider>
  );
}

export default App;
