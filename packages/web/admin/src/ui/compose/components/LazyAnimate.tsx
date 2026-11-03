import type { PropsWithChildren } from 'react';
import { LazyMotion } from 'motion/react';

/**
 * 懒加载动画容器：仅在子树首次渲染时动态加载 Motion 的 domMax 特性，
 * 避免首屏打包完整动画引擎，减小初始 bundle 体积。
 *
 * 使用方式：将需要动画的子树包裹在 <LazyAnimate> 内即可。
 */
const loadFeatures = () => import('../animate-feature').then(res => res.default);

function LazyAnimate({ children }: PropsWithChildren) {
  return <LazyMotion features={loadFeatures}>{children}</LazyMotion>;
}

export default LazyAnimate;
