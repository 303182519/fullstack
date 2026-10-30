import type { StoreApi } from 'zustand/vanilla';
import { useCreation } from 'ahooks';
import { useStore } from 'zustand';
import { createStore } from 'zustand/vanilla';

/**
 * 数组状态引擎
 *
 * 迁移自 skyroc `use-array.ts`：上游用自研 `Store` 基类，这里改为 Zustand vanilla store，
 * 逻辑（状态 + 操作方法）与 React 渲染（useStore）解耦的结构保持不变。
 */

interface ArrayState<T> {
  items: T[];
}

/** 数组 store 实例：Zustand store API + 数组操作方法 */
export interface ArrayStore<T, K extends keyof T> extends StoreApi<ArrayState<T>> {
  /** 直接更新状态 */
  updateState: (newState: T[] | ((prevState: T[]) => T[])) => void;
  /** 尾部追加（按 key 去重） */
  push: (...newItems: T[]) => void;
  /** 头部追加（按 key 去重） */
  unshift: (...newItems: T[]) => void;
  /** 按 key 移除元素 */
  remove: (itemKey: T[K]) => void;
  /** 上移元素 */
  up: (itemKey: T[K]) => void;
  /** 下移元素 */
  down: (itemKey: T[K]) => void;
  /** 移除末尾元素 */
  pop: () => void;
  /** 移除首部元素 */
  shift: () => void;
  /** 反转数组 */
  reverse: () => void;
  /** 排序数组 */
  sort: (compareFn?: (a: T, b: T) => number) => void;
  /** 拼接数组 */
  splice: (start: number, deleteCount?: number, ...items: T[]) => void;
  /** 清空数组 */
  clear: () => void;
  /** 重置为初始状态 */
  reset: () => void;
  /** 按 key 查找元素（直接读 store 快照，不依赖 React 渲染周期） */
  findItem: (elementKey: T[K]) => T | undefined;
}

/** 按 key 去重（保留首次出现的元素） */
function dedupeByKey<T, K extends keyof T>(items: T[], key: K): T[] {
  return items.filter((item, index, self) => index === self.findIndex(t => t[key] === item[key]));
}

/**
 * 创建数组 store（React 外可用，需多实例时由调用方自行管理生命周期）
 *
 * 初始数组会被拷贝一份：reset 恢复到创建时快照，不受调用方后续原地修改影响。
 */
function createArrayStore<T, K extends keyof T>(initState: T[], key?: K): ArrayStore<T, K> {
  const resolvedKey = (key ?? 'id') as K;
  const initialState = [...initState];
  const store = createStore<ArrayState<T>>()(() => ({ items: initialState }));

  const update = (updater: (prev: T[]) => T[]): void => {
    store.setState(prev => ({ items: updater(prev.items) }));
  };

  return Object.assign(store, {
    updateState: (newState: T[] | ((prevState: T[]) => T[])) => {
      update(prev => (typeof newState === 'function' ? (newState as (prevState: T[]) => T[])(prev) : newState));
    },
    push: (...newItems: T[]) => {
      update(prev => dedupeByKey([...prev, ...newItems], resolvedKey));
    },
    unshift: (...newItems: T[]) => {
      update(prev => dedupeByKey([...newItems, ...prev], resolvedKey));
    },
    remove: (itemKey: T[K]) => {
      update(prev => prev.filter(i => i[resolvedKey] !== itemKey));
    },
    up: (itemKey: T[K]) => {
      update((prev) => {
        const index = prev.findIndex(i => i[resolvedKey] === itemKey);
        const current = prev[index];
        const previous = prev[index - 1];
        if (index <= 0 || current === undefined || previous === undefined)
          return prev;
        const next = [...prev];
        next[index - 1] = current;
        next[index] = previous;
        return next;
      });
    },
    down: (itemKey: T[K]) => {
      update((prev) => {
        const index = prev.findIndex(i => i[resolvedKey] === itemKey);
        const current = prev[index];
        const following = prev[index + 1];
        if (index === -1 || index === prev.length - 1 || current === undefined || following === undefined)
          return prev;
        const next = [...prev];
        next[index] = following;
        next[index + 1] = current;
        return next;
      });
    },
    pop: () => {
      update(prev => prev.slice(0, -1));
    },
    shift: () => {
      update(prev => prev.slice(1));
    },
    reverse: () => {
      update(prev => [...prev].toReversed());
    },
    sort: (compareFn?: (a: T, b: T) => number) => {
      update(prev => [...prev].toSorted(compareFn));
    },
    splice: (start: number, deleteCount?: number, ...items: T[]) => {
      const end = deleteCount ?? 0;
      update((prev) => {
        const next = [...prev];
        next.splice(start, end, ...items);
        return next;
      });
    },
    clear: () => {
      update(() => []);
    },
    reset: () => {
      update(() => [...initialState]);
    },
    findItem: (elementKey: T[K]) => store.getState().items.find(item => item[resolvedKey] === elementKey),
  }) as ArrayStore<T, K>;
}

/**
 * 数组状态管理 hook
 *
 * Store 管逻辑，Hook 管渲染。
 *
 * @param initState - 初始数组
 * @param key - 用于唯一标识元素的字段名，默认 'id'
 * @returns [当前状态, store 实例]
 */
export default function useArray<T, K extends keyof T>(initState: T[], key?: K): [T[], ArrayStore<T, K>] {
  const store = useCreation(() => createArrayStore(initState, key), []);
  const items = useStore(store, state => state.items);
  return [items, store];
}
