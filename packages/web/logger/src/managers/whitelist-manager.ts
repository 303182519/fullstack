import type { RequestHeaders, WhitelistResponse } from '../types';
import { DEFAULT_WHITELIST_CHECK_INTERVAL } from '../constants';

interface WhitelistManagerConfig {
  /** 设备 ID */
  deviceId: string;
  /** 白名单检查端点 */
  endpoint: string;
  /** 检查间隔（毫秒） */
  checkInterval?: number;
  /** 附加请求头（如鉴权 token），静态对象或动态函数 */
  headers?: RequestHeaders;
  /** 当设备首次被加入白名单时的回调 */
  onWhitelisted?: () => void;
}

/** 设备白名单管理器 定期检查设备是否在白名单中，用于决定是否上传日志 */
export class WhitelistManager {
  /** 设备 ID */
  private deviceId: string;

  /** 白名单检查端点 */
  private endpoint: string;

  /** 检查间隔 */
  private checkInterval: number;

  /** 附加请求头 */
  private headers?: RequestHeaders;

  /** 检查计时器 */
  private checkTimer: ReturnType<typeof setInterval> | null = null;

  /** 是否在白名单中 */
  private isWhitelisted = false;

  /** 当设备首次被加入白名单时的回调 */
  private onWhitelisted?: () => void;

  /** 是否正在检查 */
  private isChecking = false;

  constructor(config: WhitelistManagerConfig) {
    this.deviceId = config.deviceId;
    this.endpoint = config.endpoint;
    this.checkInterval = config.checkInterval ?? DEFAULT_WHITELIST_CHECK_INTERVAL;
    this.headers = config.headers;
    this.onWhitelisted = config.onWhitelisted;
  }

  /** 启动定期检查 */
  start(): void {
    if (this.checkTimer) {
      return;
    }

    // 立即执行一次检查
    void this.check();

    // 启动定期检查
    this.checkTimer = setInterval(() => {
      void this.check();
    }, this.checkInterval);
  }

  /** 停止定期检查 */
  stop(): void {
    if (this.checkTimer) {
      clearInterval(this.checkTimer);
      this.checkTimer = null;
    }
  }

  /** 手动触发检查 */
  async check(): Promise<boolean> {
    if (this.isChecking) {
      return this.isWhitelisted;
    }

    this.isChecking = true;

    try {
      const response = await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(typeof this.headers === 'function' ? this.headers() : this.headers),
        },
        body: JSON.stringify({ deviceId: this.deviceId }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error: ${response.status}`);
      }

      const data: WhitelistResponse = await response.json();

      // 检查是否首次加入白名单
      const wasWhitelisted = this.isWhitelisted;
      this.isWhitelisted = data.enabled && data.deviceIds.includes(this.deviceId);

      // 如果首次被加入白名单，触发回调
      if (!wasWhitelisted && this.isWhitelisted && this.onWhitelisted) {
        this.onWhitelisted();
      }

      return this.isWhitelisted;
    }
    catch (error) {
      console.error('[WhitelistManager] Failed to check whitelist:', error);
      return this.isWhitelisted;
    }
    finally {
      this.isChecking = false;
    }
  }

  /** 获取当前白名单状态 */
  getStatus(): boolean {
    return this.isWhitelisted;
  }

  /** 销毁管理器 */
  dispose(): void {
    this.stop();
  }
}
