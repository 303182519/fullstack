import type { MenuResponseDto } from '@/types/api/menu';

import { queryOptions } from '@tanstack/react-query';

import { request } from '../request';

/**
 * admin-api 菜单接口层。契约见 apps/admin-api/src/modules/menu/menu.controller.ts。
 *
 * `GET /menus/available`：当前租户可用菜单树，登录即可读（平台维护，按套餐许可收敛）。
 */
export function fetchAvailableMenus() {
  return request<MenuResponseDto[]>({ method: 'GET', url: '/menus/available' });
}

/**
 * 菜单树的 React Query 配置。
 *
 * 菜单是低频变动的服务端数据（staleTime 5 分钟）；菜单树只存 React Query 缓存，
 * 是菜单数据的唯一事实源，不复制进 Zustand。
 */
export const menuQueryOptions = queryOptions({
  queryFn: fetchAvailableMenus,
  queryKey: ['menus', 'available'],
  staleTime: 5 * 60 * 1000,
});
