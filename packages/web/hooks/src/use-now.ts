import type { StoreApi } from 'zustand/vanilla';
import { useCreation } from 'ahooks';
import { useEffect } from 'react';
import { useStore } from 'zustand';
import { createStore } from 'zustand/vanilla';

/**
 * 当前时间状态引擎
 *
 * 迁移自 skyroc `use-now.ts`：上游用自研 `Store` 基类 + class 定时器字段，
 * 这里改为 Zustand vanilla store，定时器句柄留在闭包内。
 */

interface NowState {
  now: Date;
}

interface NowStore extends StoreApi<NowState> {
  /** 暂停计时 */
  pause: () => void;
  /** 恢复计时 */
  resume: () => void;
}

function createNowStore(interval: number): NowStore {
  const store = createStore<NowState>()(() => ({ now: new Date() }));
  let timerId: ReturnType<typeof setInterval> | null = null;

  const pause = (): void => {
    if (timerId) {
      clearInterval(timerId);
      timerId = null;
    }
  };

  const resume = (): void => {
    if (!timerId) {
      timerId = setInterval(() => {
        store.setState({ now: new Date() });
      }, interval);
    }
  };

  return Object.assign(store, { pause, resume }) as NowStore;
}

export interface UseNowOptions {
  /** 是否在初始化时立即开始计时，默认 true */
  immediate?: boolean;
  /** 更新间隔（毫秒），默认 1000 */
  interval?: number;
}

export interface UseNowReturn {
  /** 当前时间快照 */
  now: Date;
  /** 暂停计时 */
  pause: () => void;
  /** 恢复计时 */
  resume: () => void;
}

/**
 * 当前时间 hook
 *
 * Store 管逻辑，Hook 管渲染与定时器生命周期。
 *
 * @param options - 配置项
 */
export function useNow(options: UseNowOptions = {}): UseNowReturn {
  const { immediate = true, interval = 1000 } = options;
  const store = useCreation(() => createNowStore(interval), []);
  const now = useStore(store, state => state.now);

  useEffect(() => {
    if (immediate)
      store.resume();

    return () => store.pause();
  }, [store, immediate]);

  return { now, pause: store.pause, resume: store.resume };
}
