import type { Locale } from 'antd/es/locale';
import type { ReactNode } from 'react';
import { App, ConfigProvider } from 'antd';
import { useEffect } from 'react';
import { useTheme, useThemeUserNameStore } from '../hooks';
import { getAntdTheme } from './shared';
import { initAntdUI } from './ui';

interface AntdProviderProps {
  /** 传送门内容 */
  children: ReactNode;

  /** antd 国际化 locale 对象 */
  locale?: Locale;

  /** 用户名（用于水印显示，自动写入全局 store） */
  userName?: string;
}

/**
 * ContextHolder
 *
 * 利用 `App.useApp()` 获取 message / modal / notification 实例，自动完成 UI 实例初始化，
 * 无需消费者手动调用 init 函数。
 */
function ContextHolder() {
  const { message, modal, notification } = App.useApp();

  initAntdUI(message, modal, notification);
  return null;
}

/**
 * antd 统一 Provider
 *
 * 整合 ConfigProvider + App + ContextHolder，内部自动通过 useTheme 获取主题状态。
 * 用户名通过全局 store 共享，所有 useTheme 调用者都能拿到完整的 watermarkContent。
 *
 * 注意：水印渲染暂未接入（本阶段只对齐主题与 UI 实例），后续接 Watermark 时在此包裹 children。
 */
function AntdProvider(props: AntdProviderProps) {
  const { children, locale, userName } = props;

  // 将 userName 写入全局 store，供所有 useTheme 调用者读取
  useEffect(() => {
    useThemeUserNameStore.setState(userName);
  }, [userName]);

  const { darkMode, settings, themeColors } = useTheme();

  const antdTheme = getAntdTheme(themeColors, darkMode, settings);

  return (
    <ConfigProvider
      button={{
        classNames: {
          icon: 'align-1px  text-icon',
        },
      }}
      card={{
        styles: {
          body: { flex: 1, overflow: 'hidden', padding: '12px 16px ' },
        },
      }}
      locale={locale}
      segmented={{
        classNames: {
          item: 'flex-1',
          root: 'w-full [&_.ant-segmented-item-selected]:font-600',
        },
      }}
      modal={{
        centered: true,
        mask: { blur: true, enabled: true },
        classNames: {
          body: 'text-secondary',
          footer: 'mt-0 py-13px px-22px',
          header: 'px-22px',
          container:
            '[&_.ant-modal-confirm-btns]:(mt-0 py-13px border-t-1px border-border-secondary mt-22px px-22px) [&_.ant-modal-confirm-body]:px-22px pt-22px px-0 pb-0',
        },
      }}
      drawer={{
        closable: {
          placement: 'end',
        },
      }}
      form={{
        classNames: {
          label: 'font-600 text-13px',
        },
      }}
      theme={antdTheme}
    >
      <App style={{ height: '100%' }}>
        <ContextHolder />
        {children}
      </App>
    </ConfigProvider>
  );
}

export default AntdProvider;
