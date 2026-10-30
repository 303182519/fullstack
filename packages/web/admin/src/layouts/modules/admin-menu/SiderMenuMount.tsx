import type { FC } from 'react';

import { GLOBAL_SIDER_MENU_ID } from '../../constant';

/**
 * 侧栏菜单的 portal 挂载点容器（与 `AdminMenu` 配对使用）。
 *
 * 装配时放进骨架的 `Sider` 插槽，`AdminMenu`（内容区的兄弟节点）portal 进来。
 * 菜单的溢出滚动由本容器承担，antd Menu 自身不滚动。
 */
const SiderMenuMount: FC = () => (
  <div
    className="h-full overflow-x-hidden overflow-y-auto"
    id={GLOBAL_SIDER_MENU_ID}
  />
);

export default SiderMenuMount;
