import type { NProgress as NProgressInstance } from 'nprogress';
import NProgress from 'nprogress';

export interface SetupNProgressOptions {
  /** 动画缓动函数 */
  easing?: string;

  /** 拿到已初始化的 NProgress 实例，供宿主做上层配置 */
  onReady?: (nprogress: NProgressInstance) => void;

  /** 进度条容器的 CSS 选择器 */
  parent?: string;

  /** 动画时长（毫秒） */
  speed?: number;
}

export function setupNProgress(options: SetupNProgressOptions = {}) {
  const { easing = 'ease', onReady, parent = '.root', speed = 500 } = options;

  NProgress.configure({ easing, parent, speed });
  onReady?.(NProgress);

  return NProgress;
}
