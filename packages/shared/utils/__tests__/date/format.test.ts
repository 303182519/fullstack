import { describe, expect, it } from 'vitest';
import {
  formatDate,
  formatDateTime,
  formatDuration,
  formatTime,
  fromTimestamp,
  humanizeDuration,
} from '../../src/date/format';

// ==================== formatDate ====================

describe('formatDate', () => {
  it('应格式化为默认 YYYY-MM-DD', () => {
    expect(formatDate('2024-03-15T10:30:00')).toBe('2024-03-15');
  });

  it('应支持自定义格式', () => {
    expect(formatDate('2024-03-15', 'MM/DD/YYYY')).toBe('03/15/2024');
  });

  it('falsy 值应返回空字符串', () => {
    expect(formatDate(null)).toBe('');
    expect(formatDate(undefined)).toBe('');
    expect(formatDate('')).toBe('');
  });

  it('应支持 Date 对象', () => {
    const date = new Date(2024, 2, 15); // 月份从 0 开始
    expect(formatDate(date)).toBe('2024-03-15');
  });

  it('应支持时间戳', () => {
    const ts = new Date(2024, 2, 15).getTime();
    expect(formatDate(ts)).toBe('2024-03-15');
  });
});

// ==================== formatDateTime ====================

describe('formatDateTime', () => {
  it('应格式化为默认 YYYY-MM-DD HH:mm:ss', () => {
    expect(formatDateTime('2024-03-15T10:30:45')).toBe('2024-03-15 10:30:45');
  });

  it('falsy 值应返回空字符串', () => {
    expect(formatDateTime(null)).toBe('');
  });
});

// ==================== formatTime ====================

describe('formatTime', () => {
  it('应格式化为默认 HH:mm:ss', () => {
    expect(formatTime('2024-03-15T10:30:45')).toBe('10:30:45');
  });

  it('falsy 值应返回空字符串', () => {
    expect(formatTime(null)).toBe('');
  });
});

// ==================== fromTimestamp ====================

describe('fromTimestamp', () => {
  it('毫秒时间戳应正确格式化', () => {
    const ts = new Date('2024-03-15T10:30:00').getTime();
    expect(fromTimestamp(ts)).toBe('2024-03-15 10:30:00');
  });

  it('秒时间戳应自动识别并格式化', () => {
    const tsSec = Math.floor(new Date('2024-03-15T10:30:00').getTime() / 1000);
    expect(fromTimestamp(tsSec)).toBe('2024-03-15 10:30:00');
  });

  it('0 应返回空字符串', () => {
    expect(fromTimestamp(0)).toBe('');
  });
});

// ==================== formatDuration ====================

describe('formatDuration', () => {
  it('应格式化毫秒为 HH:mm:ss', () => {
    // 1 小时 30 分 15 秒 = 5415000ms
    expect(formatDuration(5415000)).toBe('01:30:15');
  });
});

// ==================== humanizeDuration ====================

describe('humanizeDuration', () => {
  it('应返回人性化描述', () => {
    // 60000ms = 1 分钟
    const result = humanizeDuration(60000);
    expect(result).toBeTruthy();
    expect(typeof result).toBe('string');
  });
});
