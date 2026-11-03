import type { MotionProps } from 'motion/react';
import type { ReactElement } from 'react';
import { cn } from '@fedstack/utils';
import { motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';

interface TypingAnimationProps extends MotionProps {
  /** 渲染的 HTML 元素类型，默认 'div' */
  as?: ReactElement['type'];
  /** 要逐字显示的文本 */
  children: string;
  className?: string;
  /** 开始前的延迟，单位毫秒，默认 0 */
  delay?: number;
  /** 每个字符之间的间隔，单位毫秒，默认 50 */
  duration?: number;
  /** 是否在元素进入视口时才开始动画，默认 false（挂载后立即开始） */
  startOnView?: boolean;
}

/**
 * 打字动画组件：将传入的文本逐字显示，模拟打字机效果。
 *
 * 使用时需要外层包裹 <LazyAnimate> 以启用动画特性懒加载，避免首屏打包完整动画引擎。
 *
 * @example
 * ```tsx
 * <LazyAnimate>
 *   <TypingAnimation>Hello, World!</TypingAnimation>
 * </LazyAnimate>
 * ```
 */
function TypingAnimation({
  as: Component = 'div',
  children,
  className,
  delay = 0,
  duration = 50,
  startOnView = false,
  ...props
}: TypingAnimationProps) {
  const MotionComponent = motion.create(Component, {
    forwardMotionProps: true,
  });

  const [displayedText, setDisplayedText] = useState<string>('');
  const [started, setStarted] = useState(false);
  const elementRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!startOnView) {
      const startTimeout = setTimeout(() => {
        setStarted(true);
      }, delay);
      return () => clearTimeout(startTimeout);
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setTimeout(() => {
            setStarted(true);
          }, delay);
          observer.disconnect();
        }
      },
      { threshold: 0.1 },
    );

    if (elementRef.current) {
      observer.observe(elementRef.current);
    }

    return () => observer.disconnect();
  }, [delay, startOnView]);

  useEffect(() => {
    if (!started)
      return;

    let i = 0;
    const typingEffect = setInterval(() => {
      if (i < children.length) {
        setDisplayedText(children.substring(0, i + 1));
        i += 1;
      }
      else {
        clearInterval(typingEffect);
      }
    }, duration);

    return () => {
      clearInterval(typingEffect);
    };
  }, [children, duration, started]);

  return (
    <MotionComponent
      className={cn('tracking-[-0.02em]', className)}
      ref={elementRef}
      {...props}
    >
      {displayedText}
    </MotionComponent>
  );
}

export default TypingAnimation;
