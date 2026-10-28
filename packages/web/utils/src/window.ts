/** 浏览器新窗口打开工具 仅用于 Web / Admin 场景 */

export interface OpenWindowOptions {
  /**
   * 是否启用安全策略（noopener + noreferrer）
   *
   * @default true
   */
  secure?: boolean;

  /**
   * 打开目标
   *
   * @default '_blank'
   */
  target?: '_blank' | '_parent' | '_self' | '_top' | string;
}

/**
 * 在新窗口中打开一个 URL
 *
 * @example
 *   openWindow('https://google.com');
 *   openWindow('/docs', { target: '_self' });
 */
export function openWindow(url: string, options: OpenWindowOptions = {}): void {
  if (typeof window === 'undefined')
    return;

  const { secure = true, target = '_blank' } = options;

  const features = secure ? 'noopener,noreferrer' : undefined;

  window.open(url, target, features);
}
