import { afterEach, describe, expect, it } from 'vitest';
import { toggleHtmlClass } from '../../src/class';

describe('toggleHtmlClass', () => {
  afterEach(() => {
    document.documentElement.className = '';
  });

  it('add 应添加 class 到 html 元素', () => {
    const { add } = toggleHtmlClass('dark');
    add();
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('remove 应移除 html 元素的 class', () => {
    const { add, remove } = toggleHtmlClass('dark');
    add();
    expect(document.documentElement.classList.contains('dark')).toBe(true);

    remove();
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  it('重复 add 不应产生重复 class', () => {
    const { add } = toggleHtmlClass('theme');
    add();
    add();
    const count = document.documentElement.className.split(' ').filter(c => c === 'theme').length;
    expect(count).toBe(1);
  });

  it('remove 不存在的 class 不应报错', () => {
    const { remove } = toggleHtmlClass('nonexistent');
    expect(() => remove()).not.toThrow();
  });
});
