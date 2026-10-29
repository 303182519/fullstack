import { createQueryClient } from '@fedstack/service/query';

/** 仅开发期打印 Query / Mutation 错误，生产环境保持静默 */
function handleError(error: unknown) {
  if (import.meta.env.DEV) {
    // oxlint-disable-next-line no-console
    console.error('Query/Mutation error:', error);
  }
}

/** 全局 QueryClient（默认值见 @fedstack/service 的 query/defaults） */
export const queryClient = createQueryClient({
  mutationCache: { onError: handleError },
  queryCache: { onError: handleError },
});
