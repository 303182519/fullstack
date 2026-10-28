import { describe, expect, it } from 'vitest';
import { arraysEqual, toArray } from '../src/array';

// ==================== toArray ====================

describe('toArray', () => {
  it('null 应返回空数组', () => {
    expect(toArray(null)).toEqual([]);
  });

  it('undefined 应返回空数组', () => {
    expect(toArray(undefined)).toEqual([]);
  });

  it('无参数应返回空数组', () => {
    expect(toArray()).toEqual([]);
  });

  it('单个值应包裹为数组', () => {
    expect(toArray(1)).toEqual([1]);
    expect(toArray('hello')).toEqual(['hello']);
    expect(toArray(false)).toEqual([false]);
  });

  it('数组应原样返回', () => {
    const arr = [1, 2, 3];
    expect(toArray(arr)).toBe(arr);
  });

  it('空数组应原样返回', () => {
    const arr: number[] = [];
    expect(toArray(arr)).toBe(arr);
  });
});

// ==================== arraysEqual ====================

describe('arraysEqual', () => {
  it('相同元素相同顺序应相等', () => {
    expect(arraysEqual([1, 2, 3], [1, 2, 3])).toBe(true);
  });

  it('相同元素不同顺序应相等（无序比较）', () => {
    expect(arraysEqual([3, 1, 2], [1, 2, 3])).toBe(true);
  });

  it('空数组应相等', () => {
    expect(arraysEqual([], [])).toBe(true);
  });

  it('长度不同应不相等', () => {
    expect(arraysEqual([1, 2], [1, 2, 3])).toBe(false);
  });

  it('元素不同应不相等', () => {
    expect(arraysEqual([1, 2, 3], [1, 2, 4])).toBe(false);
  });

  it('重复元素数量不同应不相等', () => {
    expect(arraysEqual([1, 1, 2], [1, 2, 2])).toBe(false);
  });

  it('字符串数组应正确比较', () => {
    expect(arraysEqual(['a', 'b'], ['b', 'a'])).toBe(true);
    expect(arraysEqual(['a', 'b'], ['a', 'c'])).toBe(false);
  });
});
