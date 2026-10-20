import type { StorageDriver } from './storage.types.js';
import { Inject, Injectable, Optional } from '@nestjs/common';
import { HealthIndicatorService } from '@nestjs/terminus';
import { STORAGE_DRIVER } from './storage.constants.js';

/** 健康探针使用的对象键：几乎肯定不存在，`exists` 返回 false 即「后端可达」。 */
const PROBE_KEY = '.health-probe';

/**
 * 存储健康指标（Terminus 适配层）。
 *
 * 探针语义依赖 `StorageDriver.exists` 的约定：
 * - 对象不存在 → 返回 `false`（后端可达，HTTP 200）
 * - 真实故障（网络 / 权限 / 超时）→ 抛出（后端不可达，HTTP 503）
 *
 * 因此对一个肯定不存在的探针 key 调用 `exists`：
 * - 返回 `false` → up
 * - 抛出 → down
 *
 * `STORAGE_DRIVER` 标 @Optional：未注册 StorageModule 的场景视为 degraded
 * 而非装配期报错，与 @fedstack/health 的 RedisHealthIndicator 同哲学。
 */
@Injectable()
export class StorageHealthIndicator {
  constructor(
    private readonly indicator: HealthIndicatorService,
    @Optional()
    @Inject(STORAGE_DRIVER)
    private readonly driver: StorageDriver | null,
  ) {}

  async pingCheck(key: string) {
    const check = this.indicator.check(key);

    if (!this.driver) {
      return check.degraded({ message: 'storage driver not registered' });
    }

    try {
      // exists 对不存在的探针 key 返回 false（可达）；真实故障才抛出
      await this.driver.exists(PROBE_KEY);
      return check.up();
    }
    catch (err) {
      return check.down({ message: (err as Error).message });
    }
  }
}
