import { TaskHub } from '@fedstack/utils';

/** 默认每 3 分钟查一次更新 */
const DEFAULT_UPDATE_CHECK_INTERVAL = 3 * 60 * 1000;

/** 心跳粒度的上下限，见 resolveTickInterval */
const MIN_TICK_INTERVAL = 1_000;
const MAX_TICK_INTERVAL = 30_000;

const CHECK_TASK = 'check-update';
const VISIBILITY_TASK = 'visibility';

interface GetHtmlBuildTimeOptions {
  /** HTML 入口 base URL，通常是 Vite 的 base */
  baseUrl?: string;
  /** 用于请求 index.html 的 fetch 实现，默认用全局 fetch */
  fetcher?: typeof fetch;
  /** 外部取消请求的信号 */
  signal?: AbortSignal;
}

export interface AppUpdateAvailableContext {
  /** 当前运行应用打包时的构建时间 */
  currentBuildTime: string;
  /** 从最新 index.html 读到的构建时间 */
  latestBuildTime: string;
  /** 用户关闭更新提示后调用，允许下一轮检查 */
  markPromptClosed: () => void;
}

export interface SetupAppVersionNotificationOptions {
  /** HTML 入口 base URL，通常是 Vite 的 base */
  baseUrl?: string;
  /** 当前运行应用打包时的构建时间（构建注入） */
  currentBuildTime: string;
  /** 是否启用更新检查 */
  enabled: boolean;
  /** 检查间隔（毫秒），默认 3 分钟 */
  interval?: number;
  /** 轮询过程中的 fetch 错误回调 */
  onError?: (error: unknown) => void;
  /** 检测到新版本时触发 */
  onUpdateAvailable: (context: AppUpdateAvailableContext) => void;
}

export async function getHtmlBuildTime(options: GetHtmlBuildTimeOptions = {}): Promise<string | null> {
  const { baseUrl = '/', fetcher = globalThis.fetch?.bind(globalThis), signal } = options;
  if (!fetcher)
    return null;
  const res = await fetcher(`${baseUrl}index.html?time=${Date.now()}`, { signal });
  if (!res.ok) {
    return null;
  }
  const html = await res.text();
  const match = html.match(/<meta name="buildTime" content="([^"]*)">/);
  return match?.[1] || null;
}

/**
 * 为 TaskHub 推导合适的心跳粒度
 *
 * TaskHub 不是精确定时器：周期任务实际触发窗口是 `[interval, interval + tickInterval)`，
 * 心跳越小越准但越费 CPU。
 *
 * 策略：取 interval 的一半 → 抖动不超过 50%（3 min 检查最坏拖到 3.5 min）；
 *       封顶 30 s → 别给低频任务每秒空转的心跳；
 *       兜底 1 s → 别让高频检查把 CPU 烧起来。
 */
function resolveTickInterval(interval: number): number {
  return Math.max(MIN_TICK_INTERVAL, Math.min(Math.floor(interval / 2), MAX_TICK_INTERVAL));
}

export function setupAppVersionNotification(options: SetupAppVersionNotificationOptions) {
  const {
    baseUrl = '/',
    currentBuildTime,
    enabled,
    interval = DEFAULT_UPDATE_CHECK_INTERVAL,
    onError,
    onUpdateAvailable,
  } = options;

  if (!enabled || typeof document === 'undefined')
    return;

  // 提示弹窗打开期间不再轮询，避免多个 onUpdateAvailable 并发触发
  let isPromptOpen = false;

  const hub = new TaskHub({
    onTaskError: (_taskName, error) => onError?.(error),
    tickInterval: resolveTickInterval(interval),
  });

  async function checkForUpdates(ctx: { signal: AbortSignal }) {
    if (isPromptOpen)
      return;
    const latestBuildTime = await getHtmlBuildTime({ baseUrl, signal: ctx.signal });
    if (!latestBuildTime || latestBuildTime === currentBuildTime) {
      return;
    }
    isPromptOpen = true;
    onUpdateAvailable({
      currentBuildTime,
      latestBuildTime,
      markPromptClosed() {
        isPromptOpen = false;
      },
    });
  }

  function handleVisibilityChange() {
    if (document.visibilityState !== 'visible') {
      hub.pause();
      return;
    }
    hub.resume();
    // 回到前台立刻查一次，cycle 计时也从此刻重新起算
    hub.trigger(CHECK_TASK);
  }

  hub.register({
    // 启动那一刻查没有意义：比对的正是刚加载进来的这份构建
    immediate: false,
    interval,
    name: CHECK_TASK,
    run: checkForUpdates,
    type: 'periodic',
  });

  hub.register({
    cleanup: () => document.removeEventListener('visibilitychange', handleVisibilityChange),
    name: VISIBILITY_TASK,
    // 监听器注册与"此刻页面是否可见"无关：后台加载的页面切到前台时也得能恢复轮询
    run: () => document.addEventListener('visibilitychange', handleVisibilityChange),
    type: 'listener',
  });

  hub.start();

  if (document.visibilityState !== 'visible') {
    hub.pause();
  }

  return () => hub.dispose();
}
