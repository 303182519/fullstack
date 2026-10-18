import { describe, expect, it } from 'vitest';
import {
  MASK_PLACEHOLDER,
  maskSensitive,
  OPER_LOG_RESULT_LIMIT,
  truncateResult,
} from './oper-log.mask.js';

describe('maskSensitive', () => {
  it('顶层敏感键替换为占位符', () => {
    expect(maskSensitive({ username: 'a', password: 'Secret123' })).toEqual({
      username: 'a',
      password: MASK_PLACEHOLDER,
    });
  });

  it('键名大小写不敏感', () => {
    expect(maskSensitive({ PassWord: 'x', NEWPASSWORD: 'y' })).toEqual({
      PassWord: MASK_PLACEHOLDER,
      NEWPASSWORD: MASK_PLACEHOLDER,
    });
  });

  it('嵌套对象中的敏感键同样生效', () => {
    const input = {
      body: { username: 'a', confirmPassword: 'z', captchaText: 'abcd' },
      query: { page: 1 },
    };
    expect(maskSensitive(input)).toEqual({
      body: { username: 'a', confirmPassword: MASK_PLACEHOLDER, captchaText: MASK_PLACEHOLDER },
      query: { page: 1 },
    });
  });

  it('数组元素逐项处理', () => {
    expect(maskSensitive([{ password: '1' }, { name: 'n' }])).toEqual([
      { password: MASK_PLACEHOLDER },
      { name: 'n' },
    ]);
  });

  it('非对象标量原样返回', () => {
    expect(maskSensitive('plain')).toBe('plain');
    expect(maskSensitive(42)).toBe(42);
    expect(maskSensitive(null)).toBe(null);
  });

  it('超出深度上限的深层结构整体掩码（防循环引用外的畸形结构）', () => {
    const deep = { a: { b: { c: { d: { e: { f: { password: 'x' } } } } } } };
    const masked = maskSensitive(deep) as any;
    // 第七层已超 MAX_MASK_DEPTH=6，叶子不再是对象
    expect(masked.a.b.c.d.e.f).toBe(MASK_PLACEHOLDER);
  });
});

describe('truncateResult', () => {
  it('未超限时原样返回', () => {
    const result = { id: '1', name: 'n' };
    expect(truncateResult(result)).toBe(result);
  });

  it('超限时存截断标记与预览', () => {
    const big = { blob: 'x'.repeat(OPER_LOG_RESULT_LIMIT + 100) };
    const out = truncateResult(big) as { __truncated__: boolean; preview: string };
    expect(out.__truncated__).toBe(true);
    expect(out.preview.length).toBe(OPER_LOG_RESULT_LIMIT);
    expect(out.preview.startsWith('{"blob"')).toBe(true);
  });

  it('不可序列化对象降级为 unserializable 预览', () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    const out = truncateResult(circular) as { __truncated__: boolean; preview: string };
    expect(out.__truncated__).toBe(true);
    expect(out.preview).toBe('[unserializable]');
  });
});
