import { describe, expect, it } from 'vitest';
import { addDate, diffDate, fromNow, subtractDate, toNow, toTimestamp, toUnixTimestamp } from '../../src/date/calc';

// ==================== toTimestamp ====================

describe('toTimestamp', () => {
  it('应返回毫秒时间戳', () => {
    const ts = toTimestamp('2024-03-15');
    expect(ts).toBeGreaterThan(0);
    expect(typeof ts).toBe('number');
  });

  it('falsy 值应返回 0', () => {
    expect(toTimestamp(null)).toBe(0);
    expect(toTimestamp(undefined)).toBe(0);
  });
});

// ==================== toUnixTimestamp ====================

describe('toUnixTimestamp', () => {
  it('应返回秒时间戳', () => {
    const ts = toTimestamp('2024-03-15');
    const unix = toUnixTimestamp('2024-03-15');
    expect(Math.floor(ts / 1000)).toBe(unix);
  });

  it('falsy 值应返回 0', () => {
    expect(toUnixTimestamp(null)).toBe(0);
  });
});

// ==================== addDate ====================

describe('addDate', () => {
  it('加 1 天', () => {
    const result = addDate('2024-03-15', 1, 'day');
    expect(result.format('YYYY-MM-DD')).toBe('2024-03-16');
  });

  it('加 1 月', () => {
    const result = addDate('2024-03-15', 1, 'month');
    expect(result.format('YYYY-MM-DD')).toBe('2024-04-15');
  });

  it('默认单位为天', () => {
    const result = addDate('2024-03-15', 2);
    expect(result.format('YYYY-MM-DD')).toBe('2024-03-17');
  });
});

// ==================== subtractDate ====================

describe('subtractDate', () => {
  it('减 1 天', () => {
    const result = subtractDate('2024-03-15', 1, 'day');
    expect(result.format('YYYY-MM-DD')).toBe('2024-03-14');
  });

  it('减 1 年', () => {
    const result = subtractDate('2024-03-15', 1, 'year');
    expect(result.format('YYYY-MM-DD')).toBe('2023-03-15');
  });
});

// ==================== diffDate ====================

describe('diffDate', () => {
  it('应计算天数差', () => {
    expect(diffDate('2024-03-15', '2024-03-10', 'day')).toBe(5);
  });

  it('应计算月数差', () => {
    expect(diffDate('2024-06-01', '2024-03-01', 'month')).toBe(3);
  });

  it('默认单位为天', () => {
    expect(diffDate('2024-03-15', '2024-03-10')).toBe(5);
  });
});

// ==================== fromNow ====================

describe('fromNow', () => {
  it('应返回相对时间字符串', () => {
    const result = fromNow('2020-01-01');
    expect(result).toBeTruthy();
    expect(typeof result).toBe('string');
  });

  it('应支持自定义基准日期', () => {
    const result = fromNow('2024-03-10', '2024-03-15');
    expect(result).toBeTruthy();
  });

  it('falsy 值应返回空字符串', () => {
    expect(fromNow(null)).toBe('');
  });
});

// ==================== toNow ====================

describe('toNow', () => {
  it('应返回相对时间字符串', () => {
    const result = toNow('2030-01-01');
    expect(result).toBeTruthy();
    expect(typeof result).toBe('string');
  });

  it('应支持自定义基准日期', () => {
    const result = toNow('2024-03-20', '2024-03-15');
    expect(result).toBeTruthy();
  });

  it('falsy 值应返回空字符串', () => {
    expect(toNow(null)).toBe('');
  });
});
