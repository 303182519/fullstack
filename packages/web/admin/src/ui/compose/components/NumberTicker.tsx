import type { AnimationPlaybackControls } from 'motion/react';
import type { ComponentPropsWithoutRef } from 'react';
import { cn } from '@fedstack/utils';
import { animate, useInView, useMotionValue, useSpring } from 'motion/react';
import { useEffect, useRef } from 'react';

interface NumberTickerProps extends ComponentPropsWithoutRef<'span'> {
  /** 小数位数 */
  decimalPlaces?: number;
  /** 延时时间 单位：秒 */
  delay?: number;
  /** 动画方向 */
  direction?: 'down' | 'up';
  /** 动画时长 单位：秒 如果不指定 则使用spring动画 更为自然地过渡 */
  duration?: number;
  /** 前缀 */
  prefix?: string;
  /** 起始值 */
  startValue?: number;
  /** 后缀 */
  suffix?: string;
  /** 目标值 */
  value: number;
}

/**
 * 数字滚动动画组件：当元素进入视口时，数字从起始值动画过渡到目标值。
 *
 * @example
 * ```tsx
 * <NumberTicker value={1234.56} decimalPlaces={2} prefix="$" />
 * ```
 */
function NumberTicker({
  className,
  decimalPlaces = 0,
  delay = 0,
  direction = 'up',
  duration,
  prefix = '',
  startValue = 0,
  suffix = '',
  value,
  ...props
}: NumberTickerProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const endValue = direction === 'down' ? 0 : value;
  const motionValue = useMotionValue(direction === 'down' ? value : 0);
  const isInView = useInView(ref, { margin: '0px', once: true });
  const springValue = useSpring(motionValue, {
    damping: 60,
    stiffness: 100,
  });

  function updateTextContent(latest: number) {
    if (!ref.current)
      return;
    const formattedNumber = new Intl.NumberFormat('en-US', {
      maximumFractionDigits: decimalPlaces,
      minimumFractionDigits: decimalPlaces,
    }).format(Number(latest.toFixed(decimalPlaces)));
    ref.current.textContent = `${prefix} ${formattedNumber} ${suffix}`;
  }

  /**
   * 入口触发：元素进入视口 (isInView=true) 后，延迟 delay 秒将 motionValue 推到 endValue。
   * motionValue 的数值变化本身还不会更新 DOM 文本——真正把数字渲染到 <span> 上的是下面
   * 第二个 useEffect 里注册的 spring 监听 / animate onUpdate。这里只负责"点火"。
   */
  useEffect(() => {
    if (isInView) {
      setTimeout(() => {
        motionValue.set(endValue);
      }, delay * 1000);
    }
  }, [motionValue, isInView, delay, endValue]);

  /**
   * 渲染驱动：根据有没有显式 duration，选择两种动画引擎之一来驱动 updateTextContent：
   *
   *   ┌─────────────────────────────────────────────────────────────┐
   *   │ duration 存在？                                             │
   *   │   YES → animate() 按固定时长从当前值插值到 endValue          │
   *   │         每帧 onUpdate 回调里把 latest 写回 motionValue，    │
   *   │         再直接调用 updateTextContent 更新 DOM。            │
   *   │         cleanup 调用 animation.cancel() 取消。             │
   *   │                                                             │
   *   │   NO  → 交给 useSpring 自动处理：它监听 motionValue 的变化，│
   *   │         以 spring 物理模型（damping=60, stiffness=100）     │
   *   │         平滑逼近目标值。springValue.on('change', ...)       │
   *   │         在每次 spring 数值变化时 updateTextContent。        │
   *   │         spring 的生命周期由 motion 内部管理，cleanup 留空。 │
   *   └─────────────────────────────────────────────────────────────┘
   *
   * 注意：两个分支里 updateTextContent 读的是当前 props (prefix/suffix/decimalPlaces)，
   * 所以它没被放进依赖数组——放进来会让 springValue.on('change') 反复订阅/取消。
   * 这是有意为之，但也意味着 props 变化时动画不会重新启动，需要外部重新触发。
   */
  useEffect(() => {
    let animation: AnimationPlaybackControls | undefined;
    if (duration) {
      animation = animate(
        motionValue.get(),
        endValue,
        {
          duration,
          onUpdate: (latest) => {
            motionValue.set(latest);
            updateTextContent(latest);
          },
        },
      );
    }
    else {
      springValue.on('change', (latest) => {
        updateTextContent(latest);
      });
    }
    return () => animation?.cancel();
  }, [motionValue, springValue, endValue, duration]);

  return (
    <span
      className={cn('inline-block text-white tracking-wider tabular-nums dark:text-dark', className)}
      ref={ref}
      {...props}
    >
      {prefix}
      {' '}
      {startValue}
      {' '}
      {suffix}
    </span>
  );
}

export default NumberTicker;
