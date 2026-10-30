import type { AdminBreadcrumbItem } from '@shell/layouts';
import {
  AdminHeader,
  AdminLayoutComponent,
  AdminLayoutProvider,
  AdminMenu,
  AdminTab,
  Breadcrumb,
  defaultMenuIconRegistry,
  deriveActiveKeysFromRoute,
  deriveMenuLevels,
  findMenuByPath,
  getSiderAndCollapsedWidth,
  GLOBAL_HEADER_MENU_ID,
  GLOBAL_SIDER_FIRST_LEVEL_ID,
  LAYOUT_MODE,
  LAYOUT_SCROLL_EL_ID,
  layoutSettings,
  SiderMenuMount,
  toAdminMenuTree,
  useLayoutStore,
  useMenusStore,
  useTabsStore,
  VerticalMixSider,
} from '@shell/layouts';
import { useQuery } from '@tanstack/react-query';
import {
  createFileRoute,
  Link,
  Outlet,
  redirect,
  useLocation,
  useMatches,
  useRouter,
} from '@tanstack/react-router';
import { Avatar, Dropdown, Space } from 'antd';
import { useMemo } from 'react';

import { fetchProfile, logout } from '@/service/api/auth';
import { menuQueryOptions } from '@/service/api/menu';
import { queryClient } from '@/service/queryClient';
import { useAuthStore } from '@/store/auth';

/**
 * (admin) 分组布局：后台管理壳（支持六种布局模式）。
 *
 * 模式切换由 `layoutSettings.layout.mode` 驱动——改一处，装配层所有 prop 分支自动对齐：
 * materials.mode / siderVisible / siderWidth / siderCollapsedWidth / AdminHeader.headerMode /
 * AdminMenu 的数量与 portal 目标与 menuMode / 菜单树形态 / selectBehavior。
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
  const pathname = useLocation({ select: location => location.pathname });

  const siderCollapse = useLayoutStore(state => state.siderCollapse);
  const toggleSiderCollapse = useLayoutStore(state => state.toggleSiderCollapse);
  const mixSiderFixed = useLayoutStore(state => state.mixSiderFixed);

  const storeActiveKey = useMenusStore(state => state.activeKey);
  const storeActiveSecondKey = useMenusStore(state => state.activeSecondKey);

  // 用户资料：跟随登录态的会话级数据，不主动 refetch；登出时 queryClient.clear() 一并清掉
  const { data: profile } = useQuery({
    gcTime: Infinity,
    queryFn: fetchProfile,
    queryKey: ['auth', 'profile'],
    retry: false,
    staleTime: Infinity,
  });

  // 菜单树：服务端数据走 React Query（唯一事实源），DTO → UI 模型在装配层完成
  const { data: menuDtos } = useQuery(menuQueryOptions);
  const menus = useMemo(
    () => toAdminMenuTree(menuDtos ?? [], defaultMenuIconRegistry),
    [menuDtos],
  );

  // 从当前路由派生的激活一级/二级 key（store 手动覆盖态为空时的回退）
  const routeDerived = useMemo(() => {
    const match = findMenuByPath(menus, pathname);
    const { activeFirstKey, activeSecondKey } = deriveActiveKeysFromRoute(
      match?.parents ?? [],
      match?.item.key ?? '',
    );
    return {
      activeFirstKey: storeActiveKey || activeFirstKey,
      activeSecondKey: storeActiveSecondKey || activeSecondKey,
    };
  }, [menus, pathname, storeActiveKey, storeActiveSecondKey]);

  // 按当前激活的一级/二级菜单派生各层级子菜单（SK-3.6 hybrid / vertical-mix 消费）
  const levels = useMemo(
    () => deriveMenuLevels({
      activeFirstKey: routeDerived.activeFirstKey,
      activeSecondKey: routeDerived.activeSecondKey,
      menus,
    }),
    [menus, routeDerived.activeFirstKey, routeDerived.activeSecondKey],
  );

  // ---- 六模式 → 骨架 prop 映射 ----
  const mode = layoutSettings.layout.mode;
  const isHorizontalBase = mode === LAYOUT_MODE.HORIZONTAL;

  const siderWidthBase = {
    childLevelMenusLength: levels.childLevelMenus.length,
    isActiveFirstLevelMenuHasChildren: levels.isActiveFirstHasChildren,
    mixSiderFixed,
    mode,
    secondLevelMenusLength: levels.secondLevelMenus.length,
    sider: layoutSettings.sider,
  };
  const siderWidth = getSiderAndCollapsedWidth({ ...siderWidthBase, isCollapsed: false });
  const siderCollapsedWidth = getSiderAndCollapsedWidth({ ...siderWidthBase, isCollapsed: true });

  // 顶栏优先类模式：一级菜单无子级时 siderWidth=0（getSider 已返回 0），不渲染侧栏
  const siderVisible = isHorizontalBase
    ? false
    : siderWidth > 0;

  // ---- AdminHeader prop ----
  const headerMode = isHorizontalBase || mode === LAYOUT_MODE.TOP_HYBRID_HEADER_FIRST || mode === LAYOUT_MODE.TOP_HYBRID_SIDEBAR_FIRST || mode === LAYOUT_MODE.VERTICAL_HYBRID_HEADER_FIRST
    ? 'horizontal' as const
    : 'vertical' as const;

  // ---- 面包屑：vertical 模式下放 AdminHeader center ----
  const matches = useMatches();
  const breadcrumbItems: AdminBreadcrumbItem[] = useMemo(() => {
    return matches
      .filter(match => !isLayoutGroup(match.routeId, match.pathname))
      .map(match => ({
        path: match.pathname || undefined,
        title: match.staticData?.title ?? fallbackTitle(match.pathname, match.routeId),
      }));
  }, [matches]);

  // ---- 菜单组件 ----
  // 1. vertical：一个 inline AdminMenu portal 到 sider
  // 2. horizontal：一个 horizontal AdminMenu portal 到 header，全量菜单树（antd 自动下拉）
  // 3. hybrid 三模式：两个 AdminMenu——顶栏 horizontal FirstLevel（portal 到 header，menus=firstLevelMenus，selectBehavior=activateFirst）+ 侧栏 inline（portal 到 sider，menus=secondLevelMenus，selectBehavior=default）
  // 4. vertical-mix：两个 AdminMenu——左栏 inline FirstLevel（portal 到 GLOBAL_SIDER_FIRST_LEVEL_ID，menus=firstLevelMenus，selectBehavior=activateFirst）+ 右栏 inline（portal 到 sider，menus=secondLevelMenus，selectBehavior=default）
  const isHybrid = mode === LAYOUT_MODE.VERTICAL_HYBRID_HEADER_FIRST
    || mode === LAYOUT_MODE.TOP_HYBRID_HEADER_FIRST
    || mode === LAYOUT_MODE.TOP_HYBRID_SIDEBAR_FIRST;
  const isVerticalMix = mode === LAYOUT_MODE.VERTICAL_MIX;

  const headerMenu = isHorizontalBase
    ? (
        <AdminMenu
          containerId={GLOBAL_HEADER_MENU_ID}
          menuMode="horizontal"
          menus={menus}
        />
      )
    : isHybrid
      ? (
          <AdminMenu
            containerId={GLOBAL_HEADER_MENU_ID}
            menuMode="horizontal"
            menus={levels.firstLevelMenus}
            selectBehavior="activateFirst"
          />
        )
      : null;

  const firstLevelMenu = isVerticalMix
    ? (
        <AdminMenu
          containerId={GLOBAL_SIDER_FIRST_LEVEL_ID}
          menus={levels.firstLevelMenus}
          selectBehavior="activateFirst"
        />
      )
    : null;

  const siderMenu = !isHorizontalBase
    ? (
        <AdminMenu
          menus={isHybrid || isVerticalMix ? levels.secondLevelMenus : menus}
        />
      )
    : null;

  // ---- Sider 插槽 ----
  const siderSlot = siderVisible
    ? (isVerticalMix ? <VerticalMixSider hasChildren={levels.isActiveFirstHasChildren} /> : <SiderMenuMount />)
    : null;

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
    useTabsStore.getState().reset();
    router.navigate({ replace: true, to: '/login' });
  }

  // 用户区：通过 headerRightActions 插槽注入（壳包不得请求 auth/profile）
  const userArea = (
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
      <Space className="cursor-pointer px-2">
        <Avatar size="small">
          {(profile?.nickname || profile?.username || '?').slice(0, 1).toUpperCase()}
        </Avatar>
        <span>{profile?.nickname || profile?.username || '加载中…'}</span>
      </Space>
    </Dropdown>
  );

  return (
    <AdminLayoutProvider
      slots={{
        headerRightActions: userArea,
        logoTo: '/home',
      }}
    >
      <AdminLayoutComponent
        Header={(
          <AdminHeader
            center={headerMode === 'vertical' ? <Breadcrumb items={breadcrumbItems} /> : undefined}
            headerMode={headerMode}
            // hybrid 三模式虽用 horizontal headerMode 但有侧栏，需显式显示 SiderToggle
            showSiderToggle={siderVisible}
          />
        )}
        Sider={siderSlot}
        Tab={<AdminTab />}
        footerVisible={false}
        mode={isHorizontalBase || mode === LAYOUT_MODE.TOP_HYBRID_HEADER_FIRST || mode === LAYOUT_MODE.TOP_HYBRID_SIDEBAR_FIRST ? 'horizontal' : 'vertical'}
        scrollElId={LAYOUT_SCROLL_EL_ID}
        scrollMode={layoutSettings.layout.scrollMode}
        siderCollapse={siderCollapse}
        siderCollapsedWidth={siderCollapsedWidth}
        siderVisible={siderVisible}
        siderWidth={siderWidth}
        tabVisible={true}
        updateSiderCollapse={toggleSiderCollapse}
      >
        <Outlet />
        {headerMenu}
        {firstLevelMenu}
        {siderMenu}
      </AdminLayoutComponent>
    </AdminLayoutProvider>
  );
}

/** TanStack Router 分组 layout：routeId 形如 `/(admin)`，pathname 为空，不出现在面包屑 */
function isLayoutGroup(routeId: string, pathname: string): boolean {
  const isParenGroup = /^\(.+\)$/.test(routeId);
  const hasEmptyPath = pathname === '';
  return isParenGroup || hasEmptyPath;
}

/** staticData.title 缺省回退：优先末段 pathname；兜底用 routeId */
function fallbackTitle(pathname: string, routeId: string): string {
  const trimmed = pathname.replace(/\/+$/, '') || '';
  if (!trimmed || trimmed === '/') {
    return routeId;
  }
  const tail = trimmed.slice(trimmed.lastIndexOf('/') + 1);
  return tail || trimmed;
}

// silence unused import warning — Link 由面包屑的壳包消费，此处显式保留以确认类型
void Link;
