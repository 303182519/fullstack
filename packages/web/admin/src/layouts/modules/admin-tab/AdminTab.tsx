import { CloseOutlined } from '@ant-design/icons';
import { useLocation, useMatches, useNavigate } from '@tanstack/react-router';
import { useUpdateEffect } from 'ahooks';
import { Button, Dropdown } from 'antd';
import { useCallback } from 'react';

import { useLayoutStore } from '../../store/layout';
import { useTabsStore } from '../../store/tabs';

export interface AdminTabProps {
  /** 固定不可关闭的首页 path，默认 '/home' */
  homePath?: string;
}

/** 末段 pathname 兜底标题：'/system/user' → 'user'，'/' → '首页' */
function fallbackTitle(pathname: string): string {
  const trimmed = pathname.replace(/\/+$/, '') || '/';
  if (trimmed === '/')
    return '首页';
  const tail = trimmed.slice(trimmed.lastIndexOf('/') + 1);
  return tail || trimmed;
}

const AdminTab: React.FC<AdminTabProps> = ({ homePath = '/home' }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const matches = useMatches();
  const reloadPage = useLayoutStore(state => state.reloadPage);

  const tabs = useTabsStore(state => state.tabs);
  const activeKey = useTabsStore(state => state.activeKey);
  const addTab = useTabsStore(state => state.addTab);
  const removeTab = useTabsStore(state => state.removeTab);
  const closeOthers = useTabsStore(state => state.closeOthers);
  const closeAll = useTabsStore(state => state.closeAll);

  // 路由变化 → 同步 tab（addTab 已存在则只激活 / 更新 path/title）
  useUpdateEffect(() => {
    const { pathname, search } = location;
    const fullPath = pathname + search;
    // 标题优先从当前路由的 staticData.title 取。
    // 注意：壳包 typecheck 不认识 app 侧的 StaticDataRouteOption 模块增强，
    // 用局部接口断言绕过；运行时壳包必在 app 内，staticData.title 一定可用。
    const lastMatch = matches[matches.length - 1];
    const routeStaticData = lastMatch?.staticData as
      | { title?: string }
      | undefined;
    const title = routeStaticData?.title ?? fallbackTitle(pathname);
    const closable = pathname !== homePath;
    addTab({ closable, key: pathname, path: fullPath, title });
  }, [location.pathname, location.search]);

  const switchRoute = useCallback((key: string) => {
    const tab = tabs.find(t => t.key === key);
    if (tab) {
      navigate({ to: tab.path });
    }
  }, [navigate, tabs]);

  const handleClose = useCallback((key: string) => {
    const nextKey = removeTab(key);
    if (nextKey && nextKey !== activeKey) {
      switchRoute(nextKey);
    }
  }, [activeKey, removeTab, switchRoute]);

  const handleContextMenu = useCallback((tabKey: string) => {
    const tab = tabs.find(t => t.key === tabKey);
    if (!tab)
      return null;

    const menu = {
      items: [
        { key: 'refresh', label: '刷新当前页', disabled: tab.key !== activeKey },
        { type: 'divider' as const },
        { key: 'close', label: '关闭当前', disabled: !tab.closable },
        { key: 'closeOthers', label: '关闭其他', disabled: tabs.filter(t => t.closable).length <= 1 },
        { key: 'closeAll', label: '关闭全部', disabled: !tabs.some(t => t.closable) },
      ],
      onClick: ({ key }: { key: string }) => {
        switch (key) {
          case 'refresh':
            reloadPage();
            break;
          case 'close': {
            handleClose(tabKey);
            break;
          }
          case 'closeOthers': {
            const nextKey = closeOthers(tabKey);
            if (nextKey && nextKey !== activeKey)
              switchRoute(nextKey);
            break;
          }
          case 'closeAll': {
            const nextKey = closeAll();
            if (nextKey && nextKey !== activeKey)
              switchRoute(nextKey);
            break;
          }
        }
      },
    };
    return menu;
  }, [activeKey, closeAll, closeOthers, handleClose, reloadPage, switchRoute, tabs]);

  return (
    <div className="flex h-full items-center gap-1 border-b border-border bg-surface px-2">
      <div className="flex h-full min-w-0 flex-1 items-center gap-1 overflow-x-auto">
        {tabs.map((tab) => {
          const isActive = tab.key === activeKey;
          return (
            <Dropdown
              key={tab.key}
              menu={handleContextMenu(tab.key)!}
              trigger={['contextMenu']}
            >
              <button
                type="button"
                onClick={() => switchRoute(tab.key)}
                className={[
                  'group flex h-8 shrink-0 items-center gap-1.5 rounded-md px-3 text-sm transition-colors',
                  isActive
                    ? 'bg-primary/10 text-primary'
                    : 'text-foreground/70 hover:bg-surface-hover hover:text-foreground',
                ].join(' ')}
              >
                <span className="max-w-[160px] truncate">{tab.title}</span>
                {tab.closable && (
                  <CloseOutlined
                    className="h-3.5 w-3.5 rounded-sm opacity-50 transition-opacity hover:bg-foreground/10 hover:opacity-100"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleClose(tab.key);
                    }}
                  />
                )}
              </button>
            </Dropdown>
          );
        })}
      </div>

      <div className="flex shrink-0 items-center gap-1 border-l border-border pl-2">
        <Button
          size="small"
          title="刷新当前页"
          type="text"
          onClick={reloadPage}
        >
          ↻
        </Button>
      </div>
    </div>
  );
};

export default AdminTab;
