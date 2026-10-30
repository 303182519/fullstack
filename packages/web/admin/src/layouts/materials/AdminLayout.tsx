import type { FC } from 'react';

import type { AdminLayoutProps } from './types';

import { cn } from '@fedstack/utils';
import { createLayoutCssVars } from './shared';

/**
 * 布局骨架：六种布局模式收敛后的纯 UI 原语。
 *
 * 只负责把「侧栏 / 顶栏 / 标签条 / 内容区 / 页脚」按算好的尺寸与可见性摆到位，
 * 不读 store、不读主题、不引用应用侧别名。菜单通过插槽注入（portal 挂载点由 modules 层渲染）。
 *
 * 样式全部是 Tailwind 工具类，尺寸与层级只消费根节点上的 `--layout-*` 变量。
 */
const AdminLayout: FC<AdminLayoutProps> = ({
  children,
  contentClass,
  fixedFooter = false,
  fixedTop = true,
  Footer,
  footerHeight = 48,
  footerVisible = true,
  fullContent = false,
  Header,
  headerHeight = 56,
  headerVisible = true,
  isMobile = false,
  maxZIndex = 100,
  mode = 'vertical',
  rightFooter = false,
  scrollElId,
  scrollMode = 'content',
  Sider,
  siderCollapse = false,
  siderCollapsedWidth = 64,
  siderVisible = true,
  siderWidth = 240,
  Tab,
  tabHeight = 40,
  tabVisible = true,
  updateSiderCollapse,
}) => {
  const cssVars = createLayoutCssVars({
    footerHeight,
    headerHeight,
    isMobile,
    maxZIndex,
    mode,
    siderCollapsedWidth,
    siderWidth,
    tabHeight,
  });

  const showHeader = Boolean(Header) && headerVisible;
  const showSider = !isMobile && Boolean(Sider) && siderVisible;
  const showMobileSider = isMobile && Boolean(Sider) && siderVisible;
  const showTab = Boolean(Tab) && tabVisible;
  const showFooter = Boolean(Footer) && footerVisible;

  const isWrapperScroll = scrollMode === 'wrapper';
  const isContentScroll = scrollMode === 'content';
  const isVertical = mode === 'vertical';
  const isHorizontal = mode === 'horizontal';

  // horizontal + 整页滚动时，顶栏与标签条也要吸顶（否则滚走）
  const fixedHeaderAndTab = fixedTop || (isHorizontal && isWrapperScroll);

  const leftGapClass = () => {
    if (fullContent || !showSider) {
      return '';
    }
    return siderCollapse
      ? 'pl-[var(--layout-sider-collapsed-width)]'
      : 'pl-[var(--layout-sider-width)]';
  };

  const headerLeftGapClass = isVertical ? leftGapClass() : '';

  const footerLeftGapClass = () => {
    const verticalGap = isVertical;
    const horizontalWrapperGap = isHorizontal && isWrapperScroll && !fixedFooter;
    const horizontalRight = isHorizontal && rightFooter;
    if (verticalGap || horizontalWrapperGap || horizontalRight) {
      return leftGapClass();
    }
    return '';
  };

  // 顶栏 / 页脚横跨整宽时，侧栏自身要让出它们的高度
  const siderPaddingClass = () => {
    const classNames: string[] = [];
    if (showHeader && !headerLeftGapClass) {
      classNames.push('pt-[var(--layout-header-height)]');
    }
    if (showFooter && !footerLeftGapClass()) {
      classNames.push('pb-[var(--layout-footer-height)]');
    }
    return classNames;
  };

  const headerDisplay = !fullContent && fixedHeaderAndTab ? 'block' : 'none';
  const siderDisplay = fullContent ? 'none' : 'block';
  const mobileSiderDisplay = siderCollapse ? 'none' : 'block';
  const footerDisplay = !fullContent && fixedFooter ? 'block' : 'none';

  return (
    <section
      className="relative h-full"
      style={cssVars}
    >
      <section
        className={cn('flex h-full flex-col', isWrapperScroll && 'overflow-y-auto')}
        id={isWrapperScroll ? scrollElId : undefined}
      >
        {showHeader && (
          <>
            <header
              className={cn(
                'h-[var(--layout-header-height)] shrink-0 transition-[padding-left] duration-200 z-[var(--layout-header-z-index)]',
                headerLeftGapClass,
                fixedHeaderAndTab && 'absolute left-0 top-0 w-full',
              )}
              style={{ display: fullContent ? 'none' : 'block' }}
            >
              {Header}
            </header>
            <div
              className="h-[var(--layout-header-height)] shrink-0 overflow-hidden"
              style={{ display: headerDisplay }}
            />
          </>
        )}

        {showTab && (
          <>
            <div
              className={cn(
                'h-[var(--layout-tab-height)] shrink-0 transition-[padding-left] duration-200 z-[var(--layout-tab-z-index)]',
                'top-[var(--layout-header-height)]',
                (fullContent || !showHeader) && 'top-0!',
                leftGapClass(),
                fixedHeaderAndTab && 'absolute left-0 w-full',
              )}
            >
              {Tab}
            </div>
            <div
              className="h-[var(--layout-tab-height)] shrink-0 overflow-hidden"
              style={{ display: fixedHeaderAndTab || fullContent ? 'block' : 'none' }}
            />
          </>
        )}

        {showSider && (
          <aside
            className={cn(
              'absolute left-0 top-0 h-full transition-[width] duration-200 z-[var(--layout-sider-z-index)]',
              siderCollapse ? 'w-[var(--layout-sider-collapsed-width)]' : 'w-[var(--layout-sider-width)]',
              siderPaddingClass(),
            )}
            style={{ display: siderDisplay }}
          >
            {Sider}
          </aside>
        )}

        {showMobileSider && (
          <>
            <aside
              className={cn(
                'absolute left-0 top-0 h-full w-0 overflow-hidden bg-surface transition-[width] duration-200 z-[var(--layout-mobile-sider-z-index)]',
                !siderCollapse && 'w-[var(--layout-sider-width)]',
              )}
              style={{ display: mobileSiderDisplay }}
            >
              {Sider}
            </aside>
            <div
              className="absolute left-0 top-0 h-full w-full bg-black/20 z-[var(--layout-mobile-sider-z-index)]"
              onClick={() => updateSiderCollapse()}
              style={{ display: mobileSiderDisplay }}
            />
          </>
        )}

        <main
          className={cn(
            'flex min-h-0 grow flex-col bg-layout transition-[padding-left] duration-200',
            isContentScroll && 'overflow-y-auto',
            contentClass,
            leftGapClass(),
          )}
          id={isContentScroll ? scrollElId : undefined}
        >
          {children}
        </main>

        {showFooter && (
          <>
            <footer
              className={cn(
                'h-[var(--layout-footer-height)] shrink-0 transition-[padding-left] duration-200 z-[var(--layout-footer-z-index)]',
                footerLeftGapClass(),
                fixedFooter && 'absolute bottom-0 left-0 w-full',
              )}
              style={{ display: siderDisplay }}
            >
              {Footer}
            </footer>
            <div
              className="h-[var(--layout-footer-height)] shrink-0 overflow-hidden"
              style={{ display: footerDisplay }}
            />
          </>
        )}
      </section>
    </section>
  );
};

export default AdminLayout;
