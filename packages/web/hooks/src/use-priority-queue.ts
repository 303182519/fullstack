import type { QueueConfig } from '@fedstack/utils';
import { PriorityQueue } from '@fedstack/utils';
import { useCreation } from 'ahooks';
import { useSyncExternalStore } from 'react';

/**
 * 响应式优先级队列 hook
 *
 * 迁移自 skyroc `use-priority-queue.ts`：上游用一个 adapter 包装 @skyroc/utils 的
 * PriorityQueue，再经自研 useStore 桥接 React。这里直接消费 @fedstack/utils 的
 * PriorityQueue —— 它本身就是带 subscribe 的权威数据源，不再复制一层 store，
 * 只通过 useSyncExternalStore（Zustand 内部同款原语）桥接渲染。
 */

export interface UsePriorityQueueOptions<T> extends QueueConfig<T> {
  /** 首次创建队列时写入的初始内容 */
  initialItems?: readonly T[];
}

export type UsePriorityQueueReturn<T> = readonly [items: readonly T[], queue: PriorityQueue<T>];

/**
 * 响应式优先级队列 hook
 *
 * 配置和初始内容仅在首次渲染时生效。
 *
 * @param options - 队列配置和初始内容
 * @returns 当前有序快照和稳定的队列实例
 */
export default function usePriorityQueue<T>(options: UsePriorityQueueOptions<T>): UsePriorityQueueReturn<T> {
  const { capacity, compare, getId, initialItems } = options;

  const source = useCreation(() => {
    const queue = new PriorityQueue<T>({ capacity, compare, getId });
    queue.enqueueMany([...(initialItems ?? [])]);

    return {
      queue,
      // 箭头函数固定方法 this，且实例只创建一次，引用稳定
      getSnapshot: () => queue.toArray(),
      subscribe: (listener: () => void) => queue.subscribe(listener),
    };
  }, []);

  const items = useSyncExternalStore(source.subscribe, source.getSnapshot);
  return [items, source.queue] as const;
}
