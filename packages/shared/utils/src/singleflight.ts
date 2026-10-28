/**
 * Singleflight — 合并同 key 的并发请求，共享同一个 Promise
 *
 * 类形式，适合在 Service 类中组合使用：
 *
 * ```ts
 * class UserService {
 *   private sf = new Singleflight();
 *
 *   fetchProfile(id: string) {
 *     return this.sf.do(`profile:${id}`, () => api.get(`/users/${id}/profile`));
 *   }
 * }
 * ```
 */
class Singleflight<Key = string> {
  private group = new Map<Key, Promise<any>>();

  /** 执行 fn，相同 key 的并发调用共享同一个 Promise */
  do<T>(key: Key, fn: () => Promise<T>): Promise<T> {
    let pending = this.group.get(key);
    if (!pending) {
      pending = fn().finally(() => this.group.delete(key));
      this.group.set(key, pending);
    }
    return pending;
  }

  /** 手动移除某个 key 的缓存（强制下次重新执行） */
  forget(key: Key): void {
    this.group.delete(key);
  }

  /** 清除全部缓存 */
  reset(): void {
    this.group.clear();
  }
}

/**
 * 工厂函数形式 — 创建一个 singleflight 调用函数
 *
 * ```ts
 * const sf = createSingleflight();
 * const result = await sf('cacheKey', () => fetchData());
 * ```
 */
function createSingleflight<Key = string>(): <T>(key: Key, fn: () => Promise<T>) => Promise<T> {
  const instance = new Singleflight<Key>();
  return (key, fn) => instance.do(key, fn);
}

export { createSingleflight, Singleflight };
