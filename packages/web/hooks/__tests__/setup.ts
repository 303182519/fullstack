import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// 每个用例结束后卸载 renderHook 挂载的组件，避免残留定时器 / 订阅跨用例干扰。
afterEach(() => {
  cleanup();
});
