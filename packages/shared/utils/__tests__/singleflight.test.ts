import { describe, expect, it, vi } from 'vitest';
import { createSingleflight, Singleflight } from '../src/singleflight';

// ==================== Singleflight 类 ====================

describe('singleflight: do', () => {
  it('相同 key 的并发调用应共享同一个 Promise', async () => {
    const sf = new Singleflight();
    let callCount = 0;

    const fn = () =>
      new Promise<string>((resolve) => {
        callCount += 1;
        setTimeout(resolve, 50, 'result');
      });

    const [r1, r2, r3] = await Promise.all([sf.do('key', fn), sf.do('key', fn), sf.do('key', fn)]);

    expect(callCount).toBe(1);
    expect(r1).toBe('result');
    expect(r2).toBe('result');
    expect(r3).toBe('result');
  });

  it('不同 key 应独立执行', async () => {
    const sf = new Singleflight();
    const fn1 = vi.fn().mockResolvedValue('a');
    const fn2 = vi.fn().mockResolvedValue('b');

    const [r1, r2] = await Promise.all([sf.do('k1', fn1), sf.do('k2', fn2)]);

    expect(fn1).toHaveBeenCalledTimes(1);
    expect(fn2).toHaveBeenCalledTimes(1);
    expect(r1).toBe('a');
    expect(r2).toBe('b');
  });

  it('完成后相同 key 应重新执行', async () => {
    const sf = new Singleflight();
    let callCount = 0;

    const fn = () => {
      callCount += 1;
      return Promise.resolve(callCount);
    };

    const r1 = await sf.do('key', fn);
    const r2 = await sf.do('key', fn);

    expect(r1).toBe(1);
    expect(r2).toBe(2);
    expect(callCount).toBe(2);
  });

  it('fn 抛错时所有等待者都应收到相同错误', async () => {
    const sf = new Singleflight();
    const error = new Error('boom');

    const fn = () =>
      new Promise<never>((_, reject) => {
        setTimeout(reject, 10, error);
      });

    const results = await Promise.allSettled([sf.do('key', fn), sf.do('key', fn)]);

    for (const r of results) {
      expect(r.status).toBe('rejected');
      if (r.status === 'rejected') {
        expect(r.reason).toBe(error);
      }
    }
  });

  it('fn 抛错后相同 key 应可重新执行', async () => {
    const sf = new Singleflight();

    await expect(sf.do('key', () => Promise.reject(new Error('fail')))).rejects.toThrow('fail');

    const result = await sf.do('key', () => Promise.resolve('ok'));
    expect(result).toBe('ok');
  });
});

describe('singleflight: forget', () => {
  it('forget 后相同 key 的下一次调用应重新执行', async () => {
    const sf = new Singleflight();
    let callCount = 0;

    const fn = () =>
      new Promise<number>((resolve) => {
        callCount += 1;
        const val = callCount;
        setTimeout(resolve, 50, val);
      });

    const p1 = sf.do('key', fn);
    sf.forget('key');
    const p2 = sf.do('key', fn);

    const [r1, r2] = await Promise.all([p1, p2]);

    expect(callCount).toBe(2);
    expect(r1).toBe(1);
    expect(r2).toBe(2);
  });

  it('forget 不存在的 key 不报错', () => {
    const sf = new Singleflight();
    expect(() => sf.forget('nope')).not.toThrow();
  });
});

describe('singleflight: reset', () => {
  it('reset 应清除所有缓存', async () => {
    const sf = new Singleflight();
    let callCount = 0;

    const fn = () =>
      new Promise<number>((resolve) => {
        callCount += 1;
        const val = callCount;
        setTimeout(resolve, 50, val);
      });

    const p1 = sf.do('k1', fn);
    const p2 = sf.do('k2', fn);
    sf.reset();
    const p3 = sf.do('k1', fn);
    const p4 = sf.do('k2', fn);

    await Promise.all([p1, p2, p3, p4]);

    expect(callCount).toBe(4);
  });
});

// ==================== createSingleflight 工厂函数 ====================

describe('createSingleflight', () => {
  it('工厂函数应返回可用的 singleflight 调用函数', async () => {
    const sf = createSingleflight();
    let callCount = 0;

    const fn = () => {
      callCount += 1;
      return new Promise<string>((resolve) => {
        setTimeout(resolve, 10, 'done');
      });
    };

    const [r1, r2] = await Promise.all([sf('key', fn), sf('key', fn)]);

    expect(callCount).toBe(1);
    expect(r1).toBe('done');
    expect(r2).toBe('done');
  });

  it('完成后应可重新执行', async () => {
    const sf = createSingleflight();

    const r1 = await sf('key', () => Promise.resolve(1));
    const r2 = await sf('key', () => Promise.resolve(2));

    expect(r1).toBe(1);
    expect(r2).toBe(2);
  });
});
