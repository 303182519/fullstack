import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import usePriorityQueue from '../src/use-priority-queue';

interface Task {
  id: string;
  priority: number;
}

const compare = (a: Task, b: Task) => a.priority - b.priority;
const getId = (task: Task) => task.id;

describe('usePriorityQueue', () => {
  it('返回按 compare 排序的快照', () => {
    const { result } = renderHook(() =>
      usePriorityQueue<Task>({
        compare,
        getId,
        initialItems: [{ id: 'a', priority: 2 }, { id: 'b', priority: 1 }],
      }),
    );

    expect(result.current[0].map(task => task.id)).toEqual(['b', 'a']);
  });

  it('enqueue 后快照同步更新，且订阅方跟随', () => {
    const { result } = renderHook(() =>
      usePriorityQueue<Task>({ compare, getId }),
    );

    act(() => {
      result.current[1].enqueue({ id: 'x', priority: 1 });
      result.current[1].enqueue({ id: 'y', priority: 0 });
    });

    expect(result.current[0].map(task => task.id)).toEqual(['y', 'x']);
  });

  it('capacity 超出时裁掉优先级最低的项', () => {
    const { result } = renderHook(() =>
      usePriorityQueue<Task>({
        capacity: 2,
        compare,
        getId,
        initialItems: [{ id: 'a', priority: 1 }, { id: 'b', priority: 2 }],
      }),
    );

    act(() => {
      result.current[1].enqueue({ id: 'c', priority: 3 });
    });

    expect(result.current[0].map(task => task.id)).toEqual(['a', 'b']);
  });

  it('重新渲染复用同一个队列实例', () => {
    const { result, rerender } = renderHook(() =>
      usePriorityQueue<Task>({ compare, getId, initialItems: [{ id: 'a', priority: 1 }] }),
    );
    const queue = result.current[1];

    rerender();
    expect(result.current[1]).toBe(queue);
  });
});
