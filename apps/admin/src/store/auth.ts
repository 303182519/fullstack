import { create } from 'zustand';

/**
 * 认证状态（纯内存，不持久化）。
 *
 * accessToken 只活在这一页内存里：XSS 读不到 localStorage 就没有可偷的长期凭据。
 * 页面刷新后内存丢失，由根路由 beforeLoad 用 HttpOnly Cookie 调 /auth/refresh 静默换回。
 *
 * 用户信息不在这里：走 React Query（service/api/auth.ts 的 fetchProfile），
 * staleTime: Infinity，登出时 queryClient.clear() 一并清掉。
 */
interface AuthState {
  accessToken: string | null;
  setToken: (token: string | null) => void;
  clear: () => void;
}

export const useAuthStore = create<AuthState>(set => ({
  accessToken: null,
  setToken: token => set({ accessToken: token }),
  clear: () => set({ accessToken: null }),
}));
