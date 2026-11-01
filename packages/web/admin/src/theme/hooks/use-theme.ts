import type { ThemeColor, ThemeColorKey, ThemeLayoutMode, ThemeMode } from '../types';
import { getPaletteColorByNumber } from '@fedstack/color';
import { useNow, useSystemTheme } from '@fedstack/hooks';
import { formatDateTime } from '@fedstack/utils';
import { useMemo } from 'react';
import { create } from 'zustand';
import { defaultThemeSettings } from '../config/default';

/**
 * 主题设置 store —— 主题设置的唯一事实源。
 *
 * 与 skyroc `themeSettingsAtom` 语义对齐：`setupTheme` 在 React render 之前把默认值 / 缓存值
 * 写入 store，组件通过 `useTheme()` 订阅。上游用 jotai atom，本仓统一由 Zustand 承担状态引擎。
 */
export const useThemeSettingsStore = create<Theme.ThemeSetting>()(() => defaultThemeSettings);

/** 当前用户名 —— 由 AntdProvider 写入，`useTheme` 读取后拼进水印文案 */
export const useThemeUserNameStore = create<string | undefined>()(() => undefined);

/**
 * 主题 hook
 *
 * 派生值（darkMode / themeColors / watermarkContent）用 useMemo 计算，写操作方法收在返回值里。
 * 用户名通过全局 store 共享，由 AntdProvider 自动写入，所有调用者无需传参即可拿到完整水印文案。
 */
export function useTheme() {
  const userName = useThemeUserNameStore(state => state);

  const settings = useThemeSettingsStore(state => state);

  const { isDarkMode: systemIsDark } = useSystemTheme();

  const { now: watermarkTime, pause: pauseWatermarkTime, resume: resumeWatermarkTime } = useNow({
    immediate: settings.watermark.visible,
    interval: 1000,
  });

  /** 深色模式 */
  const darkMode = useMemo(() => {
    if (settings.themeScheme === 'auto') {
      return systemIsDark;
    }
    return settings.themeScheme === 'dark';
  }, [settings.themeScheme, systemIsDark]);

  /** 灰度模式 */
  const grayscaleMode = settings.grayscale;

  /** 色弱模式 */
  const colourWeaknessMode = settings.colourWeakness;

  /** 主题色（含 primary） */
  const themeColors = useMemo<ThemeColor>(() => {
    const { isInfoFollowPrimary, otherColor, themeColor } = settings;
    return {
      primary: themeColor,
      ...otherColor,
      info: isInfoFollowPrimary ? themeColor : otherColor.info,
    };
  }, [settings.themeColor, settings.otherColor, settings.isInfoFollowPrimary]);

  /** 用于比较的 settings JSON */
  const settingsJson = useMemo(() => JSON.stringify(settings), [settings]);

  /** 水印时间格式化结果 */
  const formattedWatermarkTime = useMemo(
    () => formatDateTime(watermarkTime, settings.watermark.timeFormat),
    [watermarkTime, settings.watermark.timeFormat],
  );

  /** 水印文案 */
  const watermarkContent = useMemo(() => {
    const { watermark } = settings;

    if (!watermark.visible) {
      return '';
    }

    let content = watermark.text;

    if (watermark.enableUserName && userName) {
      content = `${content} - ${userName}`;
    }

    if (watermark.enableTime) {
      content = `${content} - ${formattedWatermarkTime}`;
    }

    return content;
  }, [settings.watermark, userName, formattedWatermarkTime]);

  /** 局部更新 settings */
  function setSettings(update: Partial<Theme.ThemeSetting>) {
    useThemeSettingsStore.setState(prev => ({ ...prev, ...update }));
  }

  /** 设置主题模式 */
  function setThemeScheme(themeScheme: ThemeMode) {
    setSettings({ themeScheme });
  }

  /** 设置灰度模式 */
  function setGrayscale(isGrayscale: boolean) {
    setSettings({ grayscale: isGrayscale });
  }

  /** 设置色弱模式 */
  function setColourWeakness(isColourWeakness: boolean) {
    setSettings({ colourWeakness: isColourWeakness });
  }

  /** 在 light / dark / auto 之间循环切换 */
  function toggleThemeScheme() {
    const themeSchemes: ThemeMode[] = ['light', 'dark', 'auto'];
    const index = themeSchemes.findIndex(item => item === settings.themeScheme);
    const nextIndex = index === themeSchemes.length - 1 ? 0 : index + 1;
    setThemeScheme(themeSchemes[nextIndex] ?? 'light');
  }

  /** 更新主题色 */
  function updateThemeColors(key: ThemeColorKey, color: string) {
    let colorValue = color;

    if (settings.recommendColor) {
      colorValue = getPaletteColorByNumber(color, 500, 'recommended');
    }

    if (key === 'primary') {
      setSettings({ themeColor: colorValue });
    }
    else {
      setSettings({ otherColor: { ...settings.otherColor, [key]: colorValue } });
    }
  }

  /** 设置布局模式 */
  function setThemeLayout(mode: ThemeLayoutMode) {
    setSettings({
      layout: {
        ...settings.layout,
        mode,
      },
    });
  }

  /** 设置水印是否拼入用户名 */
  function setWatermarkEnableUserName(enable: boolean) {
    setSettings({
      watermark: {
        ...settings.watermark,
        enableUserName: enable,
      },
    });
  }

  /** 设置水印是否拼入时间 */
  function setWatermarkEnableTime(enable: boolean) {
    setSettings({
      watermark: {
        ...settings.watermark,
        enableTime: enable,
      },
    });
  }

  /** 仅在水印可见且启用时间时运行计时器 */
  function updateWatermarkTimer() {
    const { watermark } = settings;
    const shouldRunTimer = watermark.visible && watermark.enableTime;

    if (shouldRunTimer) {
      resumeWatermarkTime();
    }
    else {
      pauseWatermarkTime();
    }
  }

  /** 重置为默认配置 */
  function reset() {
    useThemeSettingsStore.setState(defaultThemeSettings, true);
  }

  return {
    settings,
    // settings 字段平铺
    ...settings,
    // 派生值
    darkMode,
    themeColors,
    settingsJson,
    watermarkContent,
    grayscaleMode,
    colourWeaknessMode,
    // 方法
    setGrayscale,
    setColourWeakness,
    setThemeScheme,
    toggleThemeScheme,
    updateThemeColors,
    updateWatermarkTimer,
    setThemeLayout,
    setWatermarkEnableUserName,
    setWatermarkEnableTime,
    setSettings,
    reset,
  };
}

export type UseThemeReturn = ReturnType<typeof useTheme>;
