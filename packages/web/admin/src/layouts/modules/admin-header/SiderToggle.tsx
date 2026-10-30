import type { FC } from 'react';
import { MenuFoldOutlined, MenuUnfoldOutlined } from '@ant-design/icons';
import { Button } from 'antd';

import { useLayoutStore } from '../../store/layout';

/**
 * 侧栏折叠按钮。
 *
 * 读 zustand 的 siderCollapse 态，点击 toggleSiderCollapse。
 * 壳包不负责移动端抽屉模式（isMobile 由 layout store 单独存，后续 SK-3.6 补齐）。
 */
const SiderToggle: FC = () => {
  const siderCollapse = useLayoutStore(state => state.siderCollapse);
  const toggleSiderCollapse = useLayoutStore(state => state.toggleSiderCollapse);

  return (
    <Button
      aria-label={siderCollapse ? '展开侧栏' : '折叠侧栏'}
      className="mx-2"
      icon={siderCollapse ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
      type="text"
      onClick={toggleSiderCollapse}
    />
  );
};

export default SiderToggle;
