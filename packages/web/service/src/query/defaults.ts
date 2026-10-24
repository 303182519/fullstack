/** 默认 Query 配置 */
export const DEFAULT_QUERY_CONFIG = {
  gcTime: 10 * 60 * 1000,
  networkMode: 'online' as const,
  refetchOnMount: true,
  refetchOnReconnect: true,
  refetchOnWindowFocus: false,
  retry: 2,
  retryDelay: (attemptIndex: number) => Math.min(1000 * 2 ** attemptIndex, 30000),
  retryOnMount: true,
  staleTime: 30 * 1000,
  throwOnError: false,
};

/** 默认 Mutation 配置 */
export const DEFAULT_MUTATION_CONFIG = {
  gcTime: 60 * 1000,
  networkMode: 'online' as const,
  retry: 1,
  retryDelay: (attemptIndex: number) => Math.min(1000 * 2 ** attemptIndex, 10000),
  throwOnError: false,
};
