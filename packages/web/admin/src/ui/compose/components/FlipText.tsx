import type { Variants } from 'motion/react';
import { cn } from '@fedstack/utils';
import { AnimatePresence, motion } from 'motion/react';

interface FlipTextProps {
  readonly className?: string;
  /** 每个字符之间的动画延迟（秒），默认 0.08 */
  readonly delayMultiple?: number;
  /** 单个字符动画持续时间（秒），默认 0.5 */
  readonly duration?: number;
  /** 自定义 Motion Variants，默认从 X 轴 -90° 翻转到 0° */
  readonly framerProps?: Variants;
  /** 要展示的文本 */
  readonly word: string;
}

/**
 * 翻字动画：将输入文本拆分为单个字符，依次执行 3D 翻转动画。
 *
 * 使用时需要外层包裹 <LazyAnimate> 以启用动画特性懒加载，避免首屏打包完整动画引擎。
 *
 * @example
 * ```tsx
 * <LazyAnimate>
 *   <FlipText word="Hello" />
 * </LazyAnimate>
 * ```
 */
function FlipText({
  className,
  delayMultiple = 0.08,
  duration = 0.5,
  framerProps = {
    hidden: { opacity: 0, rotateX: -90 },
    visible: { opacity: 1, rotateX: 0 },
  },
  word,
}: FlipTextProps) {
  return (
    <AnimatePresence mode="sync">
      {word.split('').map((char, i) => (
        <motion.span
          animate="visible"
          className={cn('drop-shadow-sm', className)}
          initial="hidden"
          key={i}
          transition={{ delay: i * delayMultiple, duration }}
          variants={framerProps}
        >
          {char}
        </motion.span>
      ))}
    </AnimatePresence>
  );
}

export default FlipText;
