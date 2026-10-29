import { useQuery } from '@tanstack/react-query';
import { createFileRoute, Outlet, redirect, useRouter } from '@tanstack/react-router';
import { Avatar, Dropdown, Space } from 'antd';

import { fetchProfile, logout } from '@/service/api/auth';
import { queryClient } from '@/service/queryClient';
import { useAuthStore } from '@/store/auth';

/**
 * (admin) 分组布局：后台管理壳。
 * 阶段 3 接入真实的侧边栏 / 顶栏 / 标签页 Keep-Alive；当前是最小顶栏（用户区 + 登出）。
 */
export const Route = createFileRoute('/(admin)')({
  beforeLoad: ({ location }) => {
    // 未登录 → 带上回跳地址去登录页。
    // 根路由的静默续签先于这里执行，到这还是没 token 就是真没登录。
    // 必须用 location.href：location.search 是已解析的对象，直接拼字符串会得到 [object Object]
    if (!useAuthStore.getState().accessToken) {
      throw redirect({
        search: { redirect: location.href },
        to: '/login',
      });
    }
  },
  component: AdminLayout,
});

function AdminLayout() {
  const router = useRouter();

  // 用户资料：跟随登录态的会话级数据，不主动 refetch；登出时 queryClient.clear() 一并清掉
  const { data: profile } = useQuery({
    gcTime: Infinity,
    queryFn: fetchProfile,
    queryKey: ['auth', 'profile'],
    retry: false,
    staleTime: Infinity,
  });

  async function handleLogout() {
    // 先通知后端销毁会话再清本地：顺序反了会留下「本地已登出、服务端会话仍活着」的窗口
    try {
      await logout();
    }
    catch {
      // 网络失败不阻塞本地登出
    }
    useAuthStore.getState().clear();
    queryClient.clear();
    router.navigate({ replace: true, to: '/login' });
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f5f7fa' }}>
      <header
        style={{
          alignItems: 'center',
          background: '#fff',
          boxShadow: '0 1px 4px rgba(0, 0, 0, 0.08)',
          display: 'flex',
          justifyContent: 'space-between',
          padding: '0 24px',
          height: 56,
        }}
      >
        <strong>Fedstack Admin</strong>
        <Dropdown
          menu={{
            items: [{ key: 'logout', label: '退出登录' }],
            onClick: ({ key }) => {
              if (key === 'logout') {
                void handleLogout();
              }
            },
          }}
        >
          <Space style={{ cursor: 'pointer' }}>
            <Avatar size="small">
              {(profile?.nickname || profile?.username || '?').slice(0, 1).toUpperCase()}
            </Avatar>
            <span>{profile?.nickname || profile?.username || '加载中…'}</span>
          </Space>
        </Dropdown>
      </header>
      <main style={{ padding: 24 }}>
        <Outlet />
      </main>
    </div>
  );
}
