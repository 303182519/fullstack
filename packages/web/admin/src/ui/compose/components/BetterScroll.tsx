import type { Options } from '@better-scroll/core';
import type { ComponentPropsWithoutRef, Ref } from 'react';
import BScroll from '@better-scroll/core';
import { cn } from '@fedstack/utils';
import { useSize, useUpdateEffect } from 'ahooks';
import { useImperativeHandle, useLayoutEffect, useRef } from 'react';

interface Props extends ComponentPropsWithoutRef<'div'> {
  /**
   * BetterScroll options
   *
   * @link https://better-scroll.github.io/docs/zh-CN/guide/base-scroll-options.html
   */
  options: Options;
  ref?: Ref<BScroll>;
}

/**
 * BetterScroll 容器：外层负责滚动，内层承载内容。
 *
 * - 纵向滚动（scrollY）时内容不撑满高度；横向滚动时内容保持行内块以扩展宽度。
 * - 容器或内容尺寸变化后主动 refresh，避免可滚动范围滞后。
 * - 卸载时销毁实例，避免事件监听与内部定时器泄漏。
 */
function BetterScroll({ children, className, options, ref, ...rest }: Props) {
  const bsWrapper = useRef<HTMLDivElement>(null);
  const bsContent = useRef<HTMLDivElement>(null);
  const bsWrapperSize = useSize(bsWrapper);
  const bsContentSize = useSize(bsContent);
  const instance = useRef<BScroll | null>(null);
  const isScrollY = Boolean(options.scrollY);

  // 用 layout effect 而非 useMount：实例在提交阶段就绪，
  // 后续 useImperativeHandle 才能保证 ref 首次拿到的是实例而不是 null。
  // options 只在实例化时读取一次（BetterScroll 不支持运行时替换配置）。
  useLayoutEffect(() => {
    if (!bsWrapper.current)
      return;

    const bs = new BScroll(bsWrapper.current, options);
    instance.current = bs;

    return () => {
      bs.destroy();
      instance.current = null;
    };
  }, []);

  useImperativeHandle(ref, () => instance.current as BScroll, []);

  useUpdateEffect(() => {
    instance.current?.refresh();
  }, [
    bsWrapperSize?.width,
    bsWrapperSize?.height,
    bsContentSize?.width,
    bsContentSize?.height,
  ]);

  return (
    <div
      ref={bsWrapper}
      {...rest}
      className={cn('h-full text-left', className)}
    >
      <div
        ref={bsContent}
        className={cn('inline-block', !isScrollY && 'h-full')}
      >
        {children}
      </div>
    </div>
  );
}

export default BetterScroll;
