import { useCountDown } from 'ahooks';
import { useState } from 'react';

export interface UseCountDownTimerReturn {
  /** 剩余秒数 */
  count: number;
  /** 是否处于倒计时 */
  isCounting: boolean;
  /** 开始倒计时，可覆盖默认秒数 */
  start: (updateSeconds?: number) => void;
  /** 停止倒计时 */
  stop: () => void;
}

/**
 * Countdown timer hook
 *
 * @param seconds - Countdown seconds
 */
export default function useCountDownTimer(seconds: number): UseCountDownTimerReturn {
  const [fps, setFps] = useState(0);
  const [countdown] = useCountDown({ targetDate: fps });
  const count = Math.round(countdown / 1000);
  const isCounting = countdown > 0;

  function start(updateSeconds: number = seconds): void {
    setFps(Date.now() + updateSeconds * 1000);
  }

  function stop(): void {
    setFps(0);
  }

  return {
    count,
    isCounting,
    start,
    stop,
  };
}
