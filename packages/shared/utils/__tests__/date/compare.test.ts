import { describe, expect, it } from 'vitest';
import { isAfter, isBefore, isSame, isToday, isTomorrow, isValidDate, isYesterday } from '../../src/date/compare';

// ==================== isValidDate ====================

describe('isValidDate', () => {
  it('有效日期字符串应返回 true', () => {
    expect(isValidDate('2024-03-15')).toBe(true);
  });

  it('date 对象应返回 true', () => {
    expect(isValidDate(new Date())).toBe(true);
  });

  it('时间戳应返回 true', () => {
    expect(isValidDate(Date.now())).toBe(true);
  });

  it('无效字符串应返回 false', () => {
    expect(isValidDate('not-a-date')).toBe(false);
  });
});

// ==================== isBefore / isAfter ====================

describe('isBefore', () => {
  it('较早日期应在较晚日期之前', () => {
    expect(isBefore('2024-03-10', '2024-03-15')).toBe(true);
  });

  it('较晚日期不应在较早日期之前', () => {
    expect(isBefore('2024-03-15', '2024-03-10')).toBe(false);
  });

  it('相同日期不应在之前', () => {
    expect(isBefore('2024-03-15', '2024-03-15')).toBe(false);
  });
});

describe('isAfter', () => {
  it('较晚日期应在较早日期之后', () => {
    expect(isAfter('2024-03-15', '2024-03-10')).toBe(true);
  });

  it('较早日期不应在较晚日期之后', () => {
    expect(isAfter('2024-03-10', '2024-03-15')).toBe(false);
  });
});

// ==================== isSame ====================

describe('isSame', () => {
  it('相同日期应返回 true', () => {
    expect(isSame('2024-03-15', '2024-03-15')).toBe(true);
  });

  it('不同日期应返回 false', () => {
    expect(isSame('2024-03-15', '2024-03-16')).toBe(false);
  });

  it('应支持按月精度比较', () => {
    expect(isSame('2024-03-15', '2024-03-20', 'month')).toBe(true);
  });

  it('应支持按年精度比较', () => {
    expect(isSame('2024-03-15', '2024-11-20', 'year')).toBe(true);
    expect(isSame('2024-03-15', '2025-03-15', 'year')).toBe(false);
  });
});

// ==================== isToday / isYesterday / isTomorrow ====================

describe('isToday', () => {
  it('当前时间应为今天', () => {
    expect(isToday(new Date())).toBe(true);
  });

  it('固定历史日期不应为今天', () => {
    expect(isToday('2020-01-01')).toBe(false);
  });
});

describe('isYesterday', () => {
  it('昨天的日期应返回 true', () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    expect(isYesterday(yesterday)).toBe(true);
  });

  it('今天不应为昨天', () => {
    expect(isYesterday(new Date())).toBe(false);
  });
});

describe('isTomorrow', () => {
  it('明天的日期应返回 true', () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    expect(isTomorrow(tomorrow)).toBe(true);
  });

  it('今天不应为明天', () => {
    expect(isTomorrow(new Date())).toBe(false);
  });
});
