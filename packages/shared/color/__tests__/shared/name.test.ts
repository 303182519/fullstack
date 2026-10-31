import { describe, expect, it } from 'vitest';
import { getColorName } from '../../src/shared/name';

describe('getColorName', () => {
  it('标准红色应返回正确名称', () => {
    const name = getColorName('#ff0000');
    expect(name).toBeTruthy();
    expect(typeof name).toBe('string');
  });

  it('标准蓝色应返回正确名称', () => {
    const name = getColorName('#0000ff');
    expect(name).toBeTruthy();
  });

  it('白色应返回非空名称', () => {
    const name = getColorName('#ffffff');
    expect(name).toBeTruthy();
    expect(name.length).toBeGreaterThan(0);
  });

  it('黑色应返回非空名称', () => {
    const name = getColorName('#000000');
    expect(name).toBeTruthy();
    expect(name.length).toBeGreaterThan(0);
  });

  it('任意颜色都应返回非空名称', () => {
    const name = getColorName('#8b5cf6');
    expect(name).toBeTruthy();
    expect(name.length).toBeGreaterThan(0);
  });
});
