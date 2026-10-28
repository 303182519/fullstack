import { describe, expect, it, vi } from 'vitest';
import { createSubject } from '../src/createSubject';

describe('createSubject', () => {
  // ==================== 基本订阅与发送 ====================

  it('函数订阅者应收到发送的值', () => {
    const subject = createSubject<string>();
    const fn = vi.fn();

    subject.subscribe(fn);
    subject.next('hello');

    expect(fn).toHaveBeenCalledWith('hello');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('observer 对象订阅者应收到发送的值', () => {
    const subject = createSubject<number>();
    const fn = vi.fn();

    subject.subscribe({ next: fn });
    subject.next(42);

    expect(fn).toHaveBeenCalledWith(42);
  });

  it('多个订阅者都应收到值', () => {
    const subject = createSubject<string>();
    const fn1 = vi.fn();
    const fn2 = vi.fn();

    subject.subscribe(fn1);
    subject.subscribe(fn2);
    subject.next('msg');

    expect(fn1).toHaveBeenCalledWith('msg');
    expect(fn2).toHaveBeenCalledWith('msg');
  });

  // ==================== 取消订阅 ====================

  it('unsubscribe 后不应再收到值', () => {
    const subject = createSubject<string>();
    const fn = vi.fn();

    const sub = subject.subscribe(fn);
    sub.unsubscribe();
    subject.next('after');

    expect(fn).not.toHaveBeenCalled();
  });

  it('重复 unsubscribe 不应报错', () => {
    const subject = createSubject<string>();
    const sub = subject.subscribe(() => {});

    sub.unsubscribe();
    expect(() => sub.unsubscribe()).not.toThrow();
  });

  it('unsubscribe 不影响其他订阅者', () => {
    const subject = createSubject<string>();
    const fn1 = vi.fn();
    const fn2 = vi.fn();

    const sub1 = subject.subscribe(fn1);
    subject.subscribe(fn2);

    sub1.unsubscribe();
    subject.next('msg');

    expect(fn1).not.toHaveBeenCalled();
    expect(fn2).toHaveBeenCalledWith('msg');
  });

  // ==================== unsubscribe (全部清空) ====================

  it('subject.unsubscribe 应清空所有订阅者', () => {
    const subject = createSubject<string>();
    const fn = vi.fn();

    subject.subscribe(fn);
    subject.unsubscribe();
    subject.next('msg');

    expect(fn).not.toHaveBeenCalled();
    expect(subject.size).toBe(0);
  });

  // ==================== complete ====================

  it('complete 后不应再接受新订阅', () => {
    const subject = createSubject<string>();
    subject.complete();

    const fn = vi.fn();
    const sub = subject.subscribe(fn);
    sub.unsubscribe();
    subject.next('msg');

    expect(fn).not.toHaveBeenCalled();
  });

  it('complete 后 closed 应为 true', () => {
    const subject = createSubject<string>();
    expect(subject.closed).toBe(false);

    subject.complete();
    expect(subject.closed).toBe(true);
  });

  it('complete 后 next 不应发送值', () => {
    const subject = createSubject<string>();
    const fn = vi.fn();

    subject.subscribe(fn);
    subject.complete();
    subject.next('msg');

    expect(fn).not.toHaveBeenCalled();
  });

  // ==================== size 与 hasObservers ====================

  it('size 应反映当前订阅者数量', () => {
    const subject = createSubject<string>();
    expect(subject.size).toBe(0);

    const sub1 = subject.subscribe(() => {});
    expect(subject.size).toBe(1);

    subject.subscribe(() => {});
    expect(subject.size).toBe(2);

    sub1.unsubscribe();
    expect(subject.size).toBe(1);
  });

  it('hasObservers 应正确反映状态', () => {
    const subject = createSubject<string>();
    expect(subject.hasObservers()).toBe(false);

    subject.subscribe(() => {});
    expect(subject.hasObservers()).toBe(true);
  });

  // ==================== 错误隔离 ====================

  it('某个订阅者抛错不应影响其他订阅者', () => {
    const subject = createSubject<string>();
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const fn = vi.fn();

    subject.subscribe(() => {
      throw new Error('boom');
    });
    subject.subscribe(fn);

    subject.next('msg');

    expect(fn).toHaveBeenCalledWith('msg');
    expect(errorSpy).toHaveBeenCalled();

    errorSpy.mockRestore();
  });

  // ==================== 无订阅者时 next 不应报错 ====================

  it('无订阅者时 next 不应报错', () => {
    const subject = createSubject<string>();
    expect(() => subject.next('msg')).not.toThrow();
  });
});
