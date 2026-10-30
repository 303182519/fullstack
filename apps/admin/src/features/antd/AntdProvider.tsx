import type { PropsWithChildren } from 'react';
import { App as AntdApp } from 'antd';
import { useEffect } from 'react';

import { registerAntdApis } from '@/service/antd-holder';

/**
 * 把 App.useApp() 的 message / modal 实例注册到 service 层。
 * adapter 是纯 ts 模块，进不了 React 树，靠这个组件桥接。
 */
function AntdApiRegistrar() {
  const { message, modal } = AntdApp.useApp();
  useEffect(() => {
    registerAntdApis(message, modal);
  }, [message, modal]);
  return null;
}

/**
 * antd Provider 层：持有 AntdApp context，供子组件消费 message / modal。
 */
function AntdProvider({ children }: PropsWithChildren) {
  return (
    <AntdApp>
      <AntdApiRegistrar />
      {children}
    </AntdApp>
  );
}

export default AntdProvider;
