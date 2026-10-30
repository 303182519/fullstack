import { useEffect, useState } from 'react';

export type ThemeName = 'dark' | 'light';

export interface UseSystemThemeReturn {
  /** 系统是否处于深色模式 */
  isDarkMode: boolean;
  /** 系统是否处于浅色模式 */
  isLightMode: boolean;
  /** 主题名 */
  themeName: ThemeName;
}

/**
 * Hook to detect system color scheme preference
 *
 * Uses the `prefers-color-scheme` media query to detect whether the user prefers dark or light mode
 */
export function useSystemTheme(): UseSystemThemeReturn {
  const [isDarkMode, setIsDarkMode] = useState<boolean>((): boolean => {
    if (typeof window === 'undefined')
      return false;

    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  });

  const themeName: ThemeName = isDarkMode ? 'dark' : 'light';

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

    function handleChange(e: MediaQueryListEvent): void {
      setIsDarkMode(e.matches);
    }

    setIsDarkMode(mediaQuery.matches);
    mediaQuery.addEventListener('change', handleChange);

    return () => {
      mediaQuery.removeEventListener('change', handleChange);
    };
  }, []);

  return { isDarkMode, isLightMode: !isDarkMode, themeName };
}
