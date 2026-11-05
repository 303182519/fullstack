import type { SetupAppVersionNotificationOptions } from './app-update';
import type { SetupDayjsOptions } from './dayjs';
import type { SetupIconifyOfflineOptions } from './iconify';
import type { SetupNProgressOptions } from './nprogress';
import { setupAppVersionNotification } from './app-update';
import { setupDayjs } from './dayjs';
import { setupIconifyOffline } from './iconify';
import { setupNProgress } from './nprogress';

export type AdminRuntimePluginConfig<T> = false | T;
export type AdminRuntimePluginCleanup = () => void;

export interface SetupAdminRuntimePluginsOptions {
  /** 应用更新检查配置；宿主未提供通知参数前保持禁用 */
  appVersionNotification?: AdminRuntimePluginConfig<SetupAppVersionNotificationOptions>;

  /** Dayjs 运行时配置 */
  dayjs?: AdminRuntimePluginConfig<SetupDayjsOptions>;

  /** Iconify 离线 provider 配置 */
  iconifyOffline?: AdminRuntimePluginConfig<SetupIconifyOfflineOptions>;

  /** NProgress 运行时配置 */
  nprogress?: AdminRuntimePluginConfig<SetupNProgressOptions>;
}

export function setupAdminRuntimePlugins(options: SetupAdminRuntimePluginsOptions = {}) {
  const { appVersionNotification, dayjs, iconifyOffline, nprogress } = options;
  const cleanups: AdminRuntimePluginCleanup[] = [];

  if (dayjs !== false) {
    setupDayjs(resolvePluginOptions(dayjs));
  }

  if (nprogress !== false) {
    setupNProgress(resolvePluginOptions(nprogress));
  }

  if (iconifyOffline !== false) {
    setupIconifyOffline(resolvePluginOptions(iconifyOffline));
  }

  if (appVersionNotification !== false && appVersionNotification !== undefined) {
    const cleanup = setupAppVersionNotification(appVersionNotification);

    if (cleanup) {
      cleanups.push(cleanup);
    }
  }

  return function cleanupAdminRuntimePlugins() {
    for (const cleanup of [...cleanups].reverse()) {
      cleanup();
    }
  };
}

function resolvePluginOptions<T>(config: AdminRuntimePluginConfig<T> | undefined): T | undefined {
  if (config === false)
    return undefined;

  return config;
}
