import { domMax } from 'motion/react';

/**
 * Motion 动画特性集合：LazyMotion 通过动态 import 按需加载，
 * 避免首屏打包完整动画引擎。`domMax` 包含所有 DOM 动画特性。
 */
const animateFeature = domMax;

export default animateFeature;
