// Antd
export {
  AntdProvider,
  destroyMessage,
  destroyNotification,
  getAntdTheme,
  showConfirmModal,
  showErrorMessage,
  showErrorModal,
  showErrorNotification,
  showInfoMessage,
  showInfoModal,
  showInfoNotification,
  showLoadingMessage,
  showMessage,
  showModal,
  showNotification,
  showSuccessMessage,
  showSuccessModal,
  showSuccessNotification,
  showWarningMessage,
  showWarningModal,
  showWarningNotification,
} from './antd';

// antd algorithm
export * from './antd-algorithm';

// Config
export { defaultThemeSettings, themeSchemeIcons } from './config';

// Hooks
export { useTheme, useThemeSettingsStore, useThemeUserNameStore } from './hooks';
export type { UseThemeReturn } from './hooks';

// Setup
export { defineThemeOverrides, setupTheme } from './setup';

// Types
export type {
  BaseToken,
  BaseWatermarkSettings,
  OtherColor,
  ThemeColor,
  ThemeColorKey,
  ThemeIcons,
  ThemeLayoutMode,
  ThemeMode,
  ThemePageAnimateMode,
  ThemePreset,
  ThemePresetMeta,
  ThemeScrollMode,
  ThemeSettingToken,
  ThemeSettingTokenBoxShadow,
  ThemeSettingTokenColor,
  ThemeTabMode,
  ThemeTokenColor,
  ThemeTokenCSSVars,
} from './types';

// Utils
export { getDefaultThemeSettings, getThemeColors, mergeThemeSettings } from './utils/settings';
