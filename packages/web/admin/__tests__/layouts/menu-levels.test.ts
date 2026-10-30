import type { AdminMenuItem } from '../../src/layouts/utils/menu-mapper';

import { describe, expect, it } from 'vitest';

import { deriveActiveKeysFromRoute, deriveMenuLevels } from '../../src/layouts/utils/menu-levels';

function item(key: string, label: string, path?: string, children?: AdminMenuItem[]): AdminMenuItem {
  const result: AdminMenuItem = { key, label };
  if (path !== undefined) {
    result.path = path;
  }
  if (children !== undefined) {
    result.children = children;
  }
  return result;
}

// 菜单树：两个一级菜单，各有二级，第一个二级有三级
const testTree: AdminMenuItem[] = [
  item('sys', '系统管理', '/system', [
    item('sys-user', '用户管理', '/system/user'),
    item('sys-role', '角色管理', '/system/role', [
      item('sys-role-detail', '角色详情', '/system/role/detail'),
    ]),
  ]),
  item('mon', '系统监控', '/monitor', [
    item('mon-log', '日志管理', '/monitor/log'),
  ]),
  item('simple', '简单项', '/simple'),
];

describe('deriveMenuLevels', () => {
  it('空激活 key → 所有子层级为空、hasChildren 为 false', () => {
    const result = deriveMenuLevels({ menus: testTree, activeFirstKey: '', activeSecondKey: '' });

    expect(result.firstLevelMenus).toHaveLength(3);
    // firstLevelMenus 不应携带 children
    expect(result.firstLevelMenus[0]).not.toHaveProperty('children');
    expect(result.secondLevelMenus).toHaveLength(0);
    expect(result.childLevelMenus).toHaveLength(0);
    expect(result.isActiveFirstHasChildren).toBe(false);
    expect(result.isActiveSecondHasChildren).toBe(false);
  });

  it('激活 sys（有子）→ secondLevelMenus = sys.children', () => {
    const result = deriveMenuLevels({ menus: testTree, activeFirstKey: 'sys', activeSecondKey: '' });

    expect(result.secondLevelMenus).toHaveLength(2);
    expect(result.secondLevelMenus[0].key).toBe('sys-user');
    expect(result.secondLevelMenus[1].key).toBe('sys-role');
    expect(result.isActiveFirstHasChildren).toBe(true);
    expect(result.childLevelMenus).toHaveLength(0);
    expect(result.isActiveSecondHasChildren).toBe(false);
  });

  it('激活 simple（无子）→ secondLevelMenus 空、hasChildren false', () => {
    const result = deriveMenuLevels({ menus: testTree, activeFirstKey: 'simple', activeSecondKey: '' });

    expect(result.secondLevelMenus).toHaveLength(0);
    expect(result.isActiveFirstHasChildren).toBe(false);
  });

  it('同时激活 sys + sys-role → childLevelMenus = sys-role.children', () => {
    const result = deriveMenuLevels({ menus: testTree, activeFirstKey: 'sys', activeSecondKey: 'sys-role' });

    expect(result.childLevelMenus).toHaveLength(1);
    expect(result.childLevelMenus[0].key).toBe('sys-role-detail');
    expect(result.isActiveSecondHasChildren).toBe(true);
  });

  it('激活 sys 但 secondKey 不匹配 → childLevelMenus 空', () => {
    const result = deriveMenuLevels({ menus: testTree, activeFirstKey: 'sys', activeSecondKey: 'sys-user' });

    expect(result.childLevelMenus).toHaveLength(0);
    expect(result.isActiveSecondHasChildren).toBe(false);
  });

  it('activeFirstKey 在树里找不到 → secondLevelMenus 空', () => {
    const result = deriveMenuLevels({ menus: testTree, activeFirstKey: 'ghost', activeSecondKey: '' });

    expect(result.secondLevelMenus).toHaveLength(0);
    expect(result.isActiveFirstHasChildren).toBe(false);
  });
});

describe('deriveActiveKeysFromRoute', () => {
  it('parents 为空时用 selectedKey 兜底', () => {
    const result = deriveActiveKeysFromRoute([], 'sys');
    expect(result.activeFirstKey).toBe('sys');
    expect(result.activeSecondKey).toBe('sys');
  });

  it('一级路由 → activeFirstKey = parents[0]', () => {
    const result = deriveActiveKeysFromRoute([item('sys', '系统')], 'sys-user');
    expect(result.activeFirstKey).toBe('sys');
    expect(result.activeSecondKey).toBe('sys-user');
  });

  it('二级路由 → activeFirstKey = parents[0]、activeSecondKey = parents[1]', () => {
    const result = deriveActiveKeysFromRoute([
      item('sys', '系统'),
      item('sys-role', '角色'),
    ], 'sys-role-detail');
    expect(result.activeFirstKey).toBe('sys');
    expect(result.activeSecondKey).toBe('sys-role');
  });

  it('仅一个 parent → activeSecondKey 用 selectedKey 兜底', () => {
    const result = deriveActiveKeysFromRoute([item('sys', '系统')], 'sys-user');
    expect(result.activeFirstKey).toBe('sys');
    expect(result.activeSecondKey).toBe('sys-user');
  });
});
