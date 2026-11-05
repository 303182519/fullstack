import { extend } from 'dayjs';
import localeData from 'dayjs/plugin/localeData';

export interface SetupDayjsOptions {
  /** 把宿主应用的语言设置同步到 Dayjs */
  syncLocale?: () => void;

  /** 是否注册 Dayjs 的 localeData 插件 */
  withLocaleData?: boolean;
}

export function setupDayjs(options: SetupDayjsOptions = {}) {
  const { syncLocale, withLocaleData = true } = options;

  if (withLocaleData) {
    extend(localeData);
  }

  syncLocale?.();
}
