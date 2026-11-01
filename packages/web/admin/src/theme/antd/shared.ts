import type { ConfigProviderProps } from 'antd';
import { transformColorWithOpacity } from '@fedstack/color';
import { defaultPresetColors, derivative, derivativeDark } from '../antd-algorithm';

// 注册自定义 token，antd cssVar 会据此生成 --color-inverted
declare module 'antd/es/theme/interface' {
  interface AliasToken {
    colorInverted: string;
  }
}

/**
 * 生成 antd 主题配置
 *
 * @param colors 主题色
 * @param darkMode 是否深色模式
 * @param settings 主题设置
 */
export function getAntdTheme(colors: Theme.ThemeColor, darkMode: boolean, settings: Theme.ThemeSetting) {
  const { themeRadius, themeTextSize, tokens } = settings;

  const { error, info, primary, success, warning } = colors;

  const bgColor = transformColorWithOpacity(primary, darkMode ? 0.3 : 0.1, darkMode ? '#000000' : '#fff');
  const containerBgColor = darkMode ? '#1C1C1E' : tokens.light.colors.container;

  const borderColor = darkMode ? '#2E3138' : '#C6C6C8';

  // inverted 是自定义 token，只在亮色下生效
  const invertedColor = tokens.light.colors.inverted;

  const theme: ConfigProviderProps['theme'] = {
    algorithm: [darkMode ? derivativeDark : derivative],
    cssVar: {
      key: 'root',
      prefix: '',
    },
    hashed: false,
    components: {
      Button: {
        controlHeightSM: 28,
      },
      Collapse: {
        contentPadding: '16px 16px 24px 16px',
        headerBg: containerBgColor,
      },
      Segmented: {
        itemSelectedColor: primary,
        trackPadding: 3,
      },
      Menu: {
        darkItemBg: 'transparent',
        darkSubMenuItemBg: 'transparent',
        itemMarginInline: 8,
        itemSelectedBg: bgColor,
        subMenuItemBg: 'transparent',
      },
      Modal: {
        borderRadiusLG: 13,
      },
    },
    token: {
      // 先注入预设色板，再用运行时主题色覆盖语义色
      ...defaultPresetColors,
      colorBgContainer: containerBgColor,
      colorInverted: invertedColor,
      colorError: error,
      colorInfo: info,
      colorBorder: borderColor,
      colorPrimary: primary,
      colorSuccess: success,
      colorWarning: warning,
      controlHeight: 36,
      borderRadius: themeRadius,
      fontSize: themeTextSize,
    },
  };

  return theme;
}
