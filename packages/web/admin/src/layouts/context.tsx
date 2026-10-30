import type { ReactNode } from 'react';
import { createContext, useContext } from 'react';

/**
 * 布局壳插槽契约。
 *
 * 布局壳只负责装配「侧栏 / 顶栏 / 标签页 / 内容区」，本身不含业务逻辑；
 * 应用侧（`apps/admin`）通过这些插槽注入用户区、自定义操作等自身内容。
 *
 * 顶层插槽（`content` / `footer` / `logo*`）由应用侧在装配布局时直接传入；
 * `header*Actions` 是顶栏内部的补充位，供 SK-3.4 的顶栏组件消费。
 */
export interface AdminLayoutSlots {
  /** 内容区内容（通常是路由 Outlet） */
  content?: ReactNode;
  /** 页脚内容 */
  footer?: ReactNode;
  /** 顶栏左侧补充操作，位于搜索与全屏之间 */
  headerLeftActions?: ReactNode;
  /** 顶栏中部补充操作，位于语言切换与主题按钮之间 */
  headerMiddleActions?: ReactNode;
  /** 顶栏右侧补充操作，位于所有内置操作之后 */
  headerRightActions?: ReactNode;
  /** 自定义 Logo 节点（优先级高于默认 Logo 组件） */
  logo?: ReactNode;
  /** Logo 右侧标题 */
  logoTitle?: ReactNode;
  /** 点击 Logo 的跳转目标路径 */
  logoTo?: string;
}

const AdminLayoutContext = createContext<AdminLayoutSlots>({});

interface AdminLayoutProviderProps {
  slots: AdminLayoutSlots;
  children?: ReactNode;
}

/** 把应用侧插槽下发到布局壳内部组件（如顶栏） */
export function AdminLayoutProvider(props: AdminLayoutProviderProps) {
  const { children, slots } = props;
  return <AdminLayoutContext value={slots}>{children}</AdminLayoutContext>;
}

/** 读取当前插槽配置；未包在 Provider 内时返回空对象（全部插槽可选） */
export function useAdminLayoutSlots(): AdminLayoutSlots {
  return useContext(AdminLayoutContext);
}
