import { describe, expect, it } from 'vitest';
import { cn } from '../src/cn';

describe('cn', () => {
  it('应合并多个 class', () => {
    expect(cn('foo', 'bar')).toBe('foo bar');
  });

  it('应过滤 falsy 值', () => {
    expect(cn('foo', false, null, undefined, 'bar')).toBe('foo bar');
  });

  it('应支持条件对象', () => {
    expect(cn('base', { active: true, disabled: false })).toBe('base active');
  });

  it('应合并 tailwind 冲突类名（后者优先）', () => {
    expect(cn('px-2', 'px-4')).toBe('px-4');
    expect(cn('text-red-500', 'text-blue-500')).toBe('text-blue-500');
  });

  it('无参数应返回空字符串', () => {
    expect(cn()).toBe('');
  });

  it('应支持数组参数', () => {
    expect(cn(['foo', 'bar'])).toBe('foo bar');
  });
});
