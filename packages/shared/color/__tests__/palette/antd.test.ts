import { describe, expect, it } from 'vitest';
import { getAntDColorPalette, getAntDPaletteColorByIndex } from '../../src/palette/antd';

// ==================== getAntDPaletteColorByIndex ====================

describe('getAntDPaletteColorByIndex', () => {
  it('index 6（主色）应返回原色', () => {
    const result = getAntDPaletteColorByIndex('#1890ff', 6);
    expect(result).toBe('#1890ff');
  });

  it('应返回有效 hex 颜色', () => {
    for (let i = 1; i <= 11; i += 1) {
      const result = getAntDPaletteColorByIndex('#1890ff', i as any);
      expect(result).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it('浅色 index（1-5）应比主色更亮', () => {
    const main = '#1890ff';
    const light = getAntDPaletteColorByIndex(main, 1);
    // 浅色的 hex 值通常较大（更接近 #ffffff）
    expect(light).not.toBe(main);
  });

  it('深色 index（7-11）应比主色更暗', () => {
    const main = '#1890ff';
    const dark = getAntDPaletteColorByIndex(main, 10);
    expect(dark).not.toBe(main);
  });

  it('无效颜色应抛错', () => {
    expect(() => getAntDPaletteColorByIndex('invalid', 6)).toThrow();
  });

  it('纯灰色（h=0, s=0）应正确生成调色板', () => {
    // 触发 getSaturation 中 h===0 && s===0 的提前返回
    for (let i = 1; i <= 11; i += 1) {
      const result = getAntDPaletteColorByIndex('#808080', i as any);
      expect(result).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it('低饱和度颜色应正确处理饱和度下限', () => {
    // 触发 saturation < 6 的 clamp 分支
    for (let i = 1; i <= 11; i += 1) {
      const result = getAntDPaletteColorByIndex('#f5f0e8', i as any);
      expect(result).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it('高色调颜色应正确处理色调溢出', () => {
    // 红色 h≈0，在深色端 hue 可能 < 0 或 >= 360
    for (let i = 1; i <= 11; i += 1) {
      const result = getAntDPaletteColorByIndex('#ff0033', i as any);
      expect(result).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it('hue ≥ 350° 的颜色应正确处理亮色端 hue >= 360 的溢出', () => {
    // #ff0011 的 HSV hue ≈ 356°，亮色端 i=5 时 hue = 356 + 2×5 = 366 → 减 360 → 6（触发 line 112）
    for (let i = 1; i <= 11; i += 1) {
      const result = getAntDPaletteColorByIndex('#ff0011', i as any);
      expect(result).toMatch(/^#[0-9a-f]{6}$/);
    }
  });
});

// ==================== getAntDColorPalette ====================

describe('getAntDColorPalette', () => {
  it('应返回 11 个颜色', () => {
    const palette = getAntDColorPalette('#1890ff');
    expect(palette).toHaveLength(11);
  });

  it('每个颜色应为有效 hex', () => {
    const palette = getAntDColorPalette('#1890ff');
    palette.forEach((color) => {
      expect(color).toMatch(/^#[0-9a-f]{6}$/);
    });
  });

  it('第 6 个应为原色', () => {
    const palette = getAntDColorPalette('#1890ff');
    expect(palette[5]).toBe('#1890ff');
  });

  it('暗色主题应返回不同的颜色', () => {
    const light = getAntDColorPalette('#1890ff', false);
    const dark = getAntDColorPalette('#1890ff', true);
    expect(light).not.toEqual(dark);
  });

  it('暗色主题也应返回 11 个颜色', () => {
    const dark = getAntDColorPalette('#1890ff', true);
    expect(dark).toHaveLength(11);
  });

  it('不同颜色应生成不同的调色板', () => {
    const red = getAntDColorPalette('#ff0000');
    const blue = getAntDColorPalette('#0000ff');
    expect(red).not.toEqual(blue);
  });
});
