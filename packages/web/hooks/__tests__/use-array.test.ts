import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import useArray from '../src/use-array';

interface Item {
  id: number;
  name: string;
}

const initialItems: Item[] = [
  { id: 1, name: 'a' },
  { id: 2, name: 'b' },
];

describe('useArray', () => {
  it('初始化后返回同一份快照', () => {
    const { result } = renderHook(() => useArray<Item, 'id'>(initialItems, 'id'));
    expect(result.current[0]).toEqual(initialItems);
  });

  it('push / unshift 按 key 去重', () => {
    const { result } = renderHook(() => useArray<Item, 'id'>(initialItems, 'id'));

    act(() => {
      result.current[1].push({ id: 1, name: 'dup' }, { id: 3, name: 'c' });
    });
    expect(result.current[0].map(i => i.id)).toEqual([1, 2, 3]);

    act(() => {
      result.current[1].unshift({ id: 3, name: 'dup' }, { id: 0, name: 'z' });
    });
    // 去重保留首次出现项：头部的新 3 胜出，原 id=3 被丢弃（与上游行为一致）
    expect(result.current[0].map(i => i.id)).toEqual([3, 0, 1, 2]);
  });

  it('up / down 在边界处保持原顺序', () => {
    const { result } = renderHook(() => useArray<Item, 'id'>(initialItems, 'id'));

    act(() => {
      result.current[1].down(2);
    });
    expect(result.current[0].map(i => i.id)).toEqual([1, 2]);

    act(() => {
      result.current[1].up(1);
    });
    expect(result.current[0].map(i => i.id)).toEqual([1, 2]);

    act(() => {
      result.current[1].up(2);
    });
    expect(result.current[0].map(i => i.id)).toEqual([2, 1]);
  });

  it('remove / clear / reset 覆盖三种清空语义', () => {
    const { result } = renderHook(() => useArray<Item, 'id'>(initialItems, 'id'));

    act(() => {
      result.current[1].remove(1);
    });
    expect(result.current[0].map(i => i.id)).toEqual([2]);

    act(() => {
      result.current[1].clear();
    });
    expect(result.current[0]).toEqual([]);

    act(() => {
      result.current[1].reset();
    });
    expect(result.current[0]).toEqual(initialItems);
  });

  it('updateState 支持函数式更新，findItem 读取最新快照', () => {
    const { result } = renderHook(() => useArray<Item, 'id'>(initialItems, 'id'));

    act(() => {
      result.current[1].updateState(prev => prev.map(item => (item.id === 1 ? { ...item, name: 'renamed' } : item)));
    });
    expect(result.current[0][0]?.name).toBe('renamed');
    expect(result.current[1].findItem(1)?.name).toBe('renamed');
  });

  it('重新渲染不会重置已变更的状态', () => {
    const { result, rerender } = renderHook(() => useArray<Item, 'id'>(initialItems, 'id'));

    act(() => {
      result.current[1].push({ id: 3, name: 'c' });
    });
    rerender();
    expect(result.current[0].map(i => i.id)).toEqual([1, 2, 3]);
  });
});
