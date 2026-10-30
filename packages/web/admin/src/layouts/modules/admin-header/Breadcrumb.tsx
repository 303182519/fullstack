import type { BreadcrumbProps } from 'antd';
import { Link } from '@tanstack/react-router';
import { Breadcrumb as ABreadcrumb } from 'antd';

/**
 * 面包屑项：由调用方（app 侧）派生下传。
 *
 * 壳包只负责"怎么渲染面包屑"，不负责"怎么从路由算出面包屑"——
 * 路由祖先链 → `staticData.title` 的派生发生在 app 侧的布局装配里，
 * 因为 `StaticDataRouteOption` 的模块增强注册在 app 侧 `features/router/index.ts`，
 * 壳包不能反向依赖它。
 */
export interface AdminBreadcrumbItem {
  /** 显示标题（通常来自路由 `staticData.title`） */
  title: string;
  /** 跳转路径；缺省表示当前页（不渲染 Link） */
  path?: string;
}

interface AdminBreadcrumbProps {
  items: AdminBreadcrumbItem[];
}

/**
 * 顶栏面包屑。
 *
 * 数据源：app 侧传进来的 `items`（通常来自 TanStack Router `useMatches` + `staticData.title`）。
 * 空数组 / 只有一项时不渲染——登录页/404 等非后台场景的顶栏可能没有面包屑。
 */
function Breadcrumb({ items }: AdminBreadcrumbProps) {
  if (items.length < 2) {
    return null;
  }

  const bcItems: BreadcrumbProps['items'] = items.map((item, index) => {
    const isLast = index === items.length - 1;

    const node = isLast || !item.path
      ? <span className="text-foreground">{item.title}</span>
      : (
          <Link
            className="text-foreground/70 hover:text-foreground"
            to={item.path as never}
          >
            {item.title}
          </Link>
        );

    return { title: node };
  });

  return (
    <div className="flex h-full flex-1 items-center px-4 text-sm">
      <ABreadcrumb items={bcItems} />
    </div>
  );
}

export default Breadcrumb;
