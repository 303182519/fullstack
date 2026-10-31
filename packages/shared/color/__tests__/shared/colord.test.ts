import { describe, expect, it } from 'vitest';
import {
  addColorAlpha,
  adjustLightness,
  darkenColor,
  getDeltaE,
  getHex,
  getHsl,
  getHsv,
  getRgb,
  isValidColor,
  isWhiteColor,
  lightenColor,
  mixColor,
  transformColorWithOpacity,
  transformHslToHex,
} from '../../src/shared/colord';

// ==================== isValidColor ====================

describe('isValidColor', () => {
  it('有效 hex 应返回 true', () => {
    expect(isValidColor('#ff0000')).toBe(true);
    expect(isValidColor('#000')).toBe(true);
  });

  it('有效 rgb 应返回 true', () => {
    expect(isValidColor('rgb(255, 0, 0)')).toBe(true);
  });

  it('有效颜色名应返回 true', () => {
    expect(isValidColor('red')).toBe(true);
    expect(isValidColor('blue')).toBe(true);
  });

  it('无效字符串应返回 false', () => {
    expect(isValidColor('not-a-color')).toBe(false);
    expect(isValidColor('')).toBe(false);
  });
});

// ==================== getHex ====================

describe('getHex', () => {
  it('颜色名应转为 hex', () => {
    expect(getHex('red')).toBe('#ff0000');
    expect(getHex('white')).toBe('#ffffff');
    expect(getHex('black')).toBe('#000000');
  });

  it('rgb 应转为 hex', () => {
    expect(getHex('rgb(255, 0, 0)')).toBe('#ff0000');
  });

  it('hex 应原样返回（标准化）', () => {
    expect(getHex('#FF0000')).toBe('#ff0000');
    expect(getHex('#f00')).toBe('#ff0000');
  });
});

// ==================== getRgb ====================

describe('getRgb', () => {
  it('应返回 rgb 对象', () => {
    const rgb = getRgb('#ff0000');
    expect(rgb.r).toBe(255);
    expect(rgb.g).toBe(0);
    expect(rgb.b).toBe(0);
  });

  it('白色应返回 rgb(255, 255, 255)', () => {
    const rgb = getRgb('#ffffff');
    expect(rgb.r).toBe(255);
    expect(rgb.g).toBe(255);
    expect(rgb.b).toBe(255);
  });
});

// ==================== getHsl ====================

describe('getHsl', () => {
  it('红色色调应为 0', () => {
    const hsl = getHsl('#ff0000');
    expect(hsl.h).toBe(0);
    expect(hsl.s).toBe(100);
    expect(hsl.l).toBe(50);
  });

  it('蓝色色调应为 240', () => {
    const hsl = getHsl('#0000ff');
    expect(hsl.h).toBe(240);
  });
});

// ==================== getHsv ====================

describe('getHsv', () => {
  it('应返回 hsv 对象', () => {
    const hsv = getHsv('#ff0000');
    expect(hsv.h).toBe(0);
    expect(hsv.s).toBe(100);
    expect(hsv.v).toBe(100);
  });
});

// ==================== getDeltaE ====================

describe('getDeltaE', () => {
  it('相同颜色 deltaE 应为 0', () => {
    expect(getDeltaE('#ff0000', '#ff0000')).toBe(0);
  });

  it('不同颜色 deltaE 应大于 0', () => {
    expect(getDeltaE('#ff0000', '#0000ff')).toBeGreaterThan(0);
  });

  it('黑白之间 deltaE 应较大', () => {
    expect(getDeltaE('#000000', '#ffffff')).toBeGreaterThan(0.5);
  });
});

// ==================== transformHslToHex ====================

describe('transformHslToHex', () => {
  it('hsl 红色应转为 #ff0000', () => {
    expect(transformHslToHex({ h: 0, l: 50, s: 100 })).toBe('#ff0000');
  });

  it('hsl 白色应转为 #ffffff', () => {
    expect(transformHslToHex({ h: 0, l: 100, s: 0 })).toBe('#ffffff');
  });
});

// ==================== addColorAlpha ====================

describe('addColorAlpha', () => {
  it('alpha 1 应保持颜色不变', () => {
    expect(addColorAlpha('#ff0000', 1)).toBe('#ff0000');
  });

  it('alpha 0 应返回透明色的 hex', () => {
    const result = addColorAlpha('#ff0000', 0);
    expect(result).toBeTruthy();
  });

  it('alpha 0.5 应返回带透明度的 hex', () => {
    const result = addColorAlpha('#ff0000', 0.5);
    expect(result).toMatch(/^#[0-9a-f]+$/);
  });
});

// ==================== mixColor ====================

describe('mixColor', () => {
  it('ratio 0 应返回第一个颜色', () => {
    expect(mixColor('#ff0000', '#0000ff', 0)).toBe('#ff0000');
  });

  it('ratio 1 应返回第二个颜色', () => {
    expect(mixColor('#ff0000', '#0000ff', 1)).toBe('#0000ff');
  });

  it('ratio 0.5 应返回混合色', () => {
    const result = mixColor('#ff0000', '#0000ff', 0.5);
    expect(result).toMatch(/^#[0-9a-f]{6}$/);
    // 不应等于任何一个原色
    expect(result).not.toBe('#ff0000');
    expect(result).not.toBe('#0000ff');
  });
});

// ==================== transformColorWithOpacity ====================

describe('transformColorWithOpacity', () => {
  it('alpha 1 应接近原色', () => {
    const result = transformColorWithOpacity('#ff0000', 1);
    expect(result).toBe('#ff0000');
  });

  it('alpha 0 应接近背景色', () => {
    const result = transformColorWithOpacity('#ff0000', 0, '#ffffff');
    expect(result).toBe('#ffffff');
  });

  it('alpha 0.5 应返回中间色', () => {
    const result = transformColorWithOpacity('#000000', 0.5, '#ffffff');
    expect(result).toMatch(/^#[0-9a-f]{6}$/);
  });
});

// ==================== isWhiteColor ====================

describe('isWhiteColor', () => {
  it('#ffffff 应返回 true', () => {
    expect(isWhiteColor('#ffffff')).toBe(true);
  });

  it('#fff 应返回 true', () => {
    expect(isWhiteColor('#fff')).toBe(true);
  });

  it('white 应返回 true', () => {
    expect(isWhiteColor('white')).toBe(true);
  });

  it('非白色应返回 false', () => {
    expect(isWhiteColor('#000000')).toBe(false);
    expect(isWhiteColor('#ff0000')).toBe(false);
  });
});

// ==================== adjustLightness ====================

describe('adjustLightness', () => {
  it('正值应变亮', () => {
    const lighter = adjustLightness('#666666', 20);
    const original = getHsl('#666666');
    const result = getHsl(lighter);
    expect(result.l).toBeGreaterThan(original.l);
  });

  it('负值应变暗', () => {
    const darker = adjustLightness('#666666', -20);
    const original = getHsl('#666666');
    const result = getHsl(darker);
    expect(result.l).toBeLessThan(original.l);
  });

  it('0 应保持不变', () => {
    expect(adjustLightness('#666666', 0)).toBe('#666666');
  });
});

// ==================== lightenColor / darkenColor ====================

describe('lightenColor', () => {
  it('应变亮', () => {
    const result = lightenColor('#333333', 20);
    const originalL = getHsl('#333333').l;
    const resultL = getHsl(result).l;
    expect(resultL).toBeGreaterThan(originalL);
  });
});

describe('darkenColor', () => {
  it('应变暗', () => {
    const result = darkenColor('#cccccc', 20);
    const originalL = getHsl('#cccccc').l;
    const resultL = getHsl(result).l;
    expect(resultL).toBeLessThan(originalL);
  });
});
