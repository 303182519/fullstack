import type { AdminMenuItem, MenuDto } from '../../src/layouts/utils/menu-mapper';

import { describe, expect, it } from 'vitest';

import {
  findMenuByPath,
  indexMenusByKey,
  toAdminMenuTree,
} from '../../src/layouts/utils/menu-mapper';

let seq = 0;

function makeDto(overrides: Partial<MenuDto> = {}): MenuDto {
  seq += 1;
  return {
    children: [],
    icon: null,
    id: `m${seq}`,
    menuName: `菜单${seq}`,
    menuType: 'MENU',
    routePath: `/p${seq}`,
    sort: 0,
    status: 'ACTIVE',
    visible: true,
    ...overrides,
  };
}

const registry = { settings: 'ICON_SETTINGS' };

describe('toAdminMenuTree：过滤', () => {
  it('过滤 BUTTON（含 MENU 下嵌套的 BUTTON）', () => {
    const tree = toAdminMenuTree([
      makeDto({
        children: [
          makeDto({ menuType: 'BUTTON', routePath: null }),
          makeDto({ menuName: '子页面', routePath: '/system/users' }),
        ],
        menuType: 'DIRECTORY',
        routePath: '/system',
      }),
    ]);

    expect(tree).toHaveLength(1);
    expect(tree[0]!.children).toHaveLength(1);
    expect(tree[0]!.children![0]!.label).toBe('子页面');
  });

  it('过滤 visible === false', () => {
    const tree = toAdminMenuTree([
      makeDto({ menuName: '可见' }),
      makeDto({ menuName: '不可见', visible: false }),
    ]);

    expect(tree.map(item => item.label)).toEqual(['可见']);
  });

  it('过滤 status === DISABLED', () => {
    const tree = toAdminMenuTree([
      makeDto({ menuName: '启用' }),
      makeDto({ menuName: '禁用', status: 'DISABLED' }),
    ]);

    expect(tree.map(item => item.label)).toEqual(['启用']);
  });

  it('dIRECTORY 的子级被过滤殆尽时，目录本身一并丢弃', () => {
    const tree = toAdminMenuTree([
      makeDto({
        children: [makeDto({ menuType: 'BUTTON', routePath: null })],
        menuType: 'DIRECTORY',
      }),
      makeDto({ menuName: '独立页面' }),
    ]);

    expect(tree).toHaveLength(1);
    expect(tree[0]!.label).toBe('独立页面');
  });

  it('dIRECTORY 保留可见子级并递归映射', () => {
    const tree = toAdminMenuTree([
      makeDto({
        children: [
          makeDto({
            children: [makeDto({ menuName: '三级页面' })],
            menuType: 'DIRECTORY',
            routePath: null,
          }),
        ],
        menuName: '一级目录',
        menuType: 'DIRECTORY',
      }),
    ]);

    expect(tree[0]!.label).toBe('一级目录');
    expect(tree[0]!.children![0]!.children![0]!.label).toBe('三级页面');
  });
});

describe('toAdminMenuTree：排序与字段映射', () => {
  it('同级按 sort 升序（乱序输入 → 有序输出）', () => {
    const tree = toAdminMenuTree([
      makeDto({ menuName: '第三', sort: 30 }),
      makeDto({ menuName: '第一', sort: 10 }),
      makeDto({ menuName: '第二', sort: 20 }),
    ]);

    expect(tree.map(item => item.label)).toEqual(['第一', '第二', '第三']);
  });

  it('id / menuName / routePath 直接映射为 key / label / path', () => {
    const tree = toAdminMenuTree([
      makeDto({ id: 'abc', menuName: '用户管理', routePath: '/system/users' }),
    ]);

    expect(tree[0]).toMatchObject({ key: 'abc', label: '用户管理', path: '/system/users' });
  });

  it('routePath 为 null 时 path 缺省（不可导航分组）', () => {
    const tree = toAdminMenuTree([makeDto({ routePath: null })]);

    expect(tree[0]).not.toHaveProperty('path');
  });

  it('icon 字符串经注册表映射；未注册与 null 均不渲染图标', () => {
    const tree = toAdminMenuTree([
      makeDto({ icon: 'settings', menuName: '命中' }),
      makeDto({ icon: 'unknown-icon', menuName: '未注册' }),
      makeDto({ icon: null, menuName: '无图标' }),
    ], registry);

    expect(tree[0]!.icon).toBe('ICON_SETTINGS');
    expect(tree[1]).not.toHaveProperty('icon');
    expect(tree[2]).not.toHaveProperty('icon');
  });

  it('叶子节点不产出空 children 数组', () => {
    const tree = toAdminMenuTree([makeDto({ children: [] })]);

    expect(tree[0]).not.toHaveProperty('children');
  });
});

describe('findMenuByPath：选中态匹配', () => {
  const menus: AdminMenuItem[] = [
    {
      children: [
        { key: 'users', label: '用户管理', path: '/system/users' },
        { key: 'roles', label: '角色管理', path: '/system/roles' },
      ],
      key: 'system',
      label: '系统管理',
      path: '/system',
    },
    { key: 'home', label: '首页', path: '/home' },
  ];

  it('精确匹配命中并返回祖先链', () => {
    const match = findMenuByPath(menus, '/system/users');

    expect(match?.item.key).toBe('users');
    expect(match?.parents.map(item => item.key)).toEqual(['system']);
  });

  it('前缀匹配：/system/users 命中 /system/users/detail', () => {
    const match = findMenuByPath(menus, '/system/users/detail');

    expect(match?.item.key).toBe('users');
  });

  it('多个前缀命中时取 path 最长（最具体）者', () => {
    // '/system' 与 '/system/users' 都是 '/system/users/1' 的前缀，应命中后者
    const match = findMenuByPath(menus, '/system/users/1');

    expect(match?.item.key).toBe('users');
    expect(match?.parents.map(item => item.key)).toEqual(['system']);
  });

  it('精确匹配优先于其他前缀匹配', () => {
    const match = findMenuByPath(menus, '/system');

    expect(match?.item.key).toBe('system');
    expect(match?.parents).toEqual([]);
  });

  it('无命中返回 null', () => {
    expect(findMenuByPath(menus, '/not-exist')).toBeNull();
  });

  it('path 缺省的节点不参与匹配', () => {
    const groupOnly: AdminMenuItem[] = [{ key: 'g', label: '分组' }];

    expect(findMenuByPath(groupOnly, '/anything')).toBeNull();
  });

  it('根路径 / 只精确命中 path 为 / 的项，不吞噬其他前缀', () => {
    const withRoot: AdminMenuItem[] = [
      { key: 'root', label: '根', path: '/' },
      { key: 'home', label: '首页', path: '/home' },
    ];

    expect(findMenuByPath(withRoot, '/')?.item.key).toBe('root');
    expect(findMenuByPath(withRoot, '/home')?.item.key).toBe('home');
  });
});

describe('indexMenusByKey', () => {
  it('扁平化整棵树（含中间节点），key → item 可查 path', () => {
    const menus = toAdminMenuTree([
      makeDto({
        children: [makeDto({ id: 'leaf', routePath: '/system/users' })],
        id: 'dir',
        menuType: 'DIRECTORY',
      }),
    ]);

    const index = indexMenusByKey(menus);

    expect(index.size).toBe(2);
    expect(index.get('leaf')?.path).toBe('/system/users');
    expect(index.get('dir')?.children).toHaveLength(1);
  });
});
