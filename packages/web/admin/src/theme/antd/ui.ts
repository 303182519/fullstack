import type { ArgsProps as MessageArgsProps, MessageInstance, TypeOpen } from 'antd/es/message/interface';
import type { ModalFunc } from 'antd/es/modal/confirm';
import type { HookAPI as ModalHookAPI } from 'antd/es/modal/useModal';
import type { ArgsProps, NotificationInstance } from 'antd/es/notification/interface';
import type { Key } from 'react';

/** 私有 UI 实例状态 —— 由 AntdProvider 内部的 ContextHolder 自动初始化 */
const _ui = {
  message: null as MessageInstance | null,
  modal: null as ModalHookAPI | null,
  notification: null as NotificationInstance | null,
};

/**
 * 初始化 antd UI 组件实例（仅供 AntdProvider 内部使用）
 *
 * @internal
 */
export function initAntdUI(message: MessageInstance, modal: ModalHookAPI, notification: NotificationInstance) {
  _ui.message = message;
  _ui.modal = modal;
  _ui.notification = notification;
}

// ============================================================================
// Internal getters
// ============================================================================

function getMessage(): MessageInstance {
  if (!_ui.message) {
    console.error('message is not initialized, please wrap your app with AntdProvider first');
    throw new Error('message is not initialized');
  }
  return _ui.message;
}

function getModal(): ModalHookAPI {
  if (!_ui.modal) {
    console.error('modal is not initialized, please wrap your app with AntdProvider first');
    throw new Error('modal is not initialized');
  }
  return _ui.modal;
}

function getNotification(): NotificationInstance {
  if (!_ui.notification) {
    console.error('notification is not initialized, please wrap your app with AntdProvider first');
    throw new Error('notification is not initialized');
  }
  return _ui.notification;
}

// ============================================================================
// Notification
// ============================================================================

/** 显示通知 */
export function showNotification(config: ArgsProps) {
  return getNotification().open(config);
}

/** 销毁通知（不传 key 则销毁全部） */
export function destroyNotification(key?: Key) {
  return getNotification().destroy(key);
}

/** 显示成功通知 */
export function showSuccessNotification(config: ArgsProps) {
  return getNotification().success(config);
}

/** 显示错误通知 */
export function showErrorNotification(config: ArgsProps) {
  return getNotification().error(config);
}

/** 显示信息通知 */
export function showInfoNotification(config: ArgsProps) {
  return getNotification().info(config);
}

/** 显示警告通知 */
export function showWarningNotification(config: ArgsProps) {
  return getNotification().warning(config);
}

// ============================================================================
// Message
// ============================================================================

/** 显示消息 */
export function showMessage(config: MessageArgsProps) {
  return getMessage().open(config);
}

/** 销毁消息（不传 key 则销毁全部） */
export function destroyMessage(key?: Key) {
  return getMessage().destroy(key);
}

/** 显示成功消息 */
export const showSuccessMessage: TypeOpen = (...args) => {
  return getMessage().success(...args);
};

/** 显示错误消息 */
export const showErrorMessage: TypeOpen = (...args) => {
  return getMessage().error(...args);
};

/** 显示信息消息 */
export const showInfoMessage: TypeOpen = (...args) => {
  return getMessage().info(...args);
};

/** 显示警告消息 */
export const showWarningMessage: TypeOpen = (...args) => {
  return getMessage().warning(...args);
};

/** 显示加载消息 */
export const showLoadingMessage: TypeOpen = (...args) => {
  return getMessage().loading(...args);
};

// ============================================================================
// Modal
// ============================================================================

/** 显示模态框 */
export const showModal: ModalFunc = (...args) => {
  return getModal().confirm(...args);
};

/** 显示确认模态框 */
export const showConfirmModal: ModalFunc = (...args) => {
  return getModal().confirm(...args);
};

/** 显示信息模态框 */
export const showInfoModal: ModalFunc = (...args) => {
  return getModal().info(...args);
};

/** 显示成功模态框 */
export const showSuccessModal: ModalFunc = (...args) => {
  return getModal().success(...args);
};

/** 显示错误模态框 */
export const showErrorModal: ModalFunc = (...args) => {
  return getModal().error(...args);
};

/** 显示警告模态框 */
export const showWarningModal: ModalFunc = (...args) => {
  return getModal().warning(...args);
};
