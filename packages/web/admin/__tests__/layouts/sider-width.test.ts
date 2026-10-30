import type { SiderWidthParams } from '../../src/layouts/utils/sider-width';

import { describe, expect, it } from 'vitest';
import { layoutSettings } from '../../src/layouts/config/layout-settings';
import { LAYOUT_MODE } from '../../src/layouts/constant';

import { getSiderAndCollapsedWidth } from '../../src/layouts/utils/sider-width';

/**
 * 用 `layoutSettings.sider` 的真实默认值（240 / 64 / 80 / 48 / 160）跑分支，
 * 同时锁定配置与纯函数之间的契约。
 */
const sider = layoutSettings.sider;

function widthOf(overrides: Partial<SiderWidthParams>): number {
  return getSiderAndCollapsedWidth({
    isCollapsed: false,
    mode: LAYOUT_MODE.VERTICAL,
    sider,
    isActiveFirstLevelMenuHasChildren: false,
    secondLevelMenusLength: 0,
    childLevelMenusLength: 0,
    mixSiderFixed: false,
    ...overrides,
  });
}

describe('layoutSettings 默认值契约', () => {
  it('sider 五宽度取值锁定（240 / 64 / 80 / 48 / 160）', () => {
    expect(sider).toEqual({
      width: 240,
      collapsedWidth: 64,
      mixWidth: 80,
      mixCollapsedWidth: 48,
      mixChildMenuWidth: 160,
    });
  });
});

describe('getSiderAndCollapsedWidth', () => {
  describe('vertical：基础模式，只随折叠切换', () => {
    it('展开 → width', () => {
      expect(widthOf({ mode: LAYOUT_MODE.VERTICAL })).toBe(sider.width);
    });

    it('折叠 → collapsedWidth', () => {
      expect(widthOf({ mode: LAYOUT_MODE.VERTICAL, isCollapsed: true })).toBe(sider.collapsedWidth);
    });

    it('固定子栏 + 有子菜单也不追加（非 mix 类模式）', () => {
      expect(widthOf({
        mode: LAYOUT_MODE.VERTICAL,
        isActiveFirstLevelMenuHasChildren: true,
        secondLevelMenusLength: 2,
        childLevelMenusLength: 3,
        mixSiderFixed: true,
      })).toBe(sider.width);
    });
  });

  describe('horizontal：无侧栏模式，函数仍按基础宽度取值（是否渲染由调用方决定）', () => {
    it('展开 → width', () => {
      expect(widthOf({ mode: LAYOUT_MODE.HORIZONTAL })).toBe(sider.width);
    });

    it('折叠 → collapsedWidth', () => {
      expect(widthOf({ mode: LAYOUT_MODE.HORIZONTAL, isCollapsed: true })).toBe(sider.collapsedWidth);
    });
  });

  describe('vertical-mix：mix 系列宽度 + 子栏固定追加', () => {
    it('展开 → mixWidth', () => {
      expect(widthOf({ mode: LAYOUT_MODE.VERTICAL_MIX })).toBe(sider.mixWidth);
    });

    it('折叠 → mixCollapsedWidth', () => {
      expect(widthOf({ mode: LAYOUT_MODE.VERTICAL_MIX, isCollapsed: true })).toBe(sider.mixCollapsedWidth);
    });

    it('子栏固定且有二级菜单 → mixWidth + mixChildMenuWidth', () => {
      expect(widthOf({
        mode: LAYOUT_MODE.VERTICAL_MIX,
        mixSiderFixed: true,
        secondLevelMenusLength: 2,
      })).toBe(sider.mixWidth + sider.mixChildMenuWidth);
    });

    it('子栏固定但无二级菜单 → 不追加', () => {
      expect(widthOf({
        mode: LAYOUT_MODE.VERTICAL_MIX,
        mixSiderFixed: true,
        secondLevelMenusLength: 0,
      })).toBe(sider.mixWidth);
    });

    it('有二级菜单但子栏未固定 → 不追加', () => {
      expect(widthOf({
        mode: LAYOUT_MODE.VERTICAL_MIX,
        mixSiderFixed: false,
        secondLevelMenusLength: 2,
      })).toBe(sider.mixWidth);
    });

    it('折叠态下子栏固定追加同样生效', () => {
      expect(widthOf({
        mode: LAYOUT_MODE.VERTICAL_MIX,
        isCollapsed: true,
        mixSiderFixed: true,
        secondLevelMenusLength: 2,
      })).toBe(sider.mixCollapsedWidth + sider.mixChildMenuWidth);
    });
  });

  describe('vertical-hybrid-header-first：无子级归零，有子级走 mix 宽度', () => {
    it('一级菜单无子级 → 0（不渲染侧栏）', () => {
      expect(widthOf({
        mode: LAYOUT_MODE.VERTICAL_HYBRID_HEADER_FIRST,
        isActiveFirstLevelMenuHasChildren: false,
      })).toBe(0);
    });

    it('折叠且无子级 → 0', () => {
      expect(widthOf({
        mode: LAYOUT_MODE.VERTICAL_HYBRID_HEADER_FIRST,
        isCollapsed: true,
        isActiveFirstLevelMenuHasChildren: false,
      })).toBe(0);
    });

    it('有子级 → mixWidth / mixCollapsedWidth', () => {
      expect(widthOf({
        mode: LAYOUT_MODE.VERTICAL_HYBRID_HEADER_FIRST,
        isActiveFirstLevelMenuHasChildren: true,
        secondLevelMenusLength: 2,
      })).toBe(sider.mixWidth);
      expect(widthOf({
        mode: LAYOUT_MODE.VERTICAL_HYBRID_HEADER_FIRST,
        isCollapsed: true,
        isActiveFirstLevelMenuHasChildren: true,
        secondLevelMenusLength: 2,
      })).toBe(sider.mixCollapsedWidth);
    });

    it('子栏固定且有子级菜单 → 追加 mixChildMenuWidth', () => {
      expect(widthOf({
        mode: LAYOUT_MODE.VERTICAL_HYBRID_HEADER_FIRST,
        isActiveFirstLevelMenuHasChildren: true,
        secondLevelMenusLength: 2,
        childLevelMenusLength: 3,
        mixSiderFixed: true,
      })).toBe(sider.mixWidth + sider.mixChildMenuWidth);
    });

    it('子栏固定但子级菜单为空 → 不追加', () => {
      expect(widthOf({
        mode: LAYOUT_MODE.VERTICAL_HYBRID_HEADER_FIRST,
        isActiveFirstLevelMenuHasChildren: true,
        secondLevelMenusLength: 2,
        childLevelMenusLength: 0,
        mixSiderFixed: true,
      })).toBe(sider.mixWidth);
    });
  });

  describe('top-hybrid-sidebar-first：mix 宽度，不受「无子级归零」约束', () => {
    it('一级菜单无子级仍出侧栏 → mixWidth', () => {
      expect(widthOf({
        mode: LAYOUT_MODE.TOP_HYBRID_SIDEBAR_FIRST,
        isActiveFirstLevelMenuHasChildren: false,
      })).toBe(sider.mixWidth);
    });

    it('折叠 → mixCollapsedWidth', () => {
      expect(widthOf({
        mode: LAYOUT_MODE.TOP_HYBRID_SIDEBAR_FIRST,
        isCollapsed: true,
      })).toBe(sider.mixCollapsedWidth);
    });

    it('子栏固定 + 有二级菜单也不追加（追加分支只属 vertical-mix / vertical-hybrid-header-first）', () => {
      expect(widthOf({
        mode: LAYOUT_MODE.TOP_HYBRID_SIDEBAR_FIRST,
        mixSiderFixed: true,
        secondLevelMenusLength: 2,
      })).toBe(sider.mixWidth);
    });
  });

  describe('top-hybrid-header-first：无子级归零，有子级走 mix 宽度', () => {
    it('一级菜单无子级 → 0', () => {
      expect(widthOf({
        mode: LAYOUT_MODE.TOP_HYBRID_HEADER_FIRST,
        isActiveFirstLevelMenuHasChildren: false,
      })).toBe(0);
    });

    it('有子级 → mixWidth', () => {
      expect(widthOf({
        mode: LAYOUT_MODE.TOP_HYBRID_HEADER_FIRST,
        isActiveFirstLevelMenuHasChildren: true,
        secondLevelMenusLength: 2,
      })).toBe(sider.mixWidth);
    });

    it('有子级且折叠 → mixCollapsedWidth', () => {
      expect(widthOf({
        mode: LAYOUT_MODE.TOP_HYBRID_HEADER_FIRST,
        isCollapsed: true,
        isActiveFirstLevelMenuHasChildren: true,
        secondLevelMenusLength: 2,
      })).toBe(sider.mixCollapsedWidth);
    });

    it('子栏固定 + 有子级菜单也不追加（追加分支只属 vertical-mix / vertical-hybrid-header-first）', () => {
      expect(widthOf({
        mode: LAYOUT_MODE.TOP_HYBRID_HEADER_FIRST,
        isActiveFirstLevelMenuHasChildren: true,
        secondLevelMenusLength: 2,
        childLevelMenusLength: 3,
        mixSiderFixed: true,
      })).toBe(sider.mixWidth);
    });
  });
});
