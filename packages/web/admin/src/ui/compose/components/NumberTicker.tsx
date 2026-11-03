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

  useEffect(() => {
    if (isInView) {
      setTimeout(() => {
        motionValue.set(endValue);
      }, delay * 1000);
    }
  }, [motionValue, isInView, delay, endValue]);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
