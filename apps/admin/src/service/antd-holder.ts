import type { MessageInstance } from 'antd/es/message/interface';
import type { HookAPI as ModalHookApi } from 'antd/es/modal/useModal';

/**
 * antd 的 message / modal 实例持有者。
 *
 * adapter 是纯 ts 模块，拿不到 React 树里 `App.useApp()` 的实例；由 bootstrap 里的注册组件
 * 挂载后把实例写进来。注册前的调用（只有启动早期请求错误才可能撞上）静默丢弃——
 * 那时页面还没有可交互 UI，丢弃比 crash 合理。
 */
let messageApi: MessageInstance | null = null;
let modalApi: ModalHookApi | null = null;

export function registerAntdApis(message: MessageInstance, modal: ModalHookApi): void {
  messageApi = message;
  modalApi = modal;
}

export function getMessageApi(): MessageInstance | null {
  return messageApi;
}

export function getModalApi(): ModalHookApi | null {
  return modalApi;
}
