import type { DateInput } from './constants';
import { dayjs } from './dayjs';

// ==================== 日期边界 ====================

/**
 * 获取一天的开始时间 00:00:00
 *
 * @param date 日期输入
 */
export function startOfDay(date: DateInput): dayjs.Dayjs {
  return dayjs(date).startOf('day');
}

/**
 * 获取一天的结束时间 23:59:59
 *
 * @param date 日期输入
 */
export function endOfDay(date: DateInput): dayjs.Dayjs {
  return dayjs(date).endOf('day');
}

/**
 * 获取一周的开始
 *
 * @param date 日期输入
 */
export function startOfWeek(date: DateInput): dayjs.Dayjs {
  return dayjs(date).startOf('week');
}

/**
 * 获取一周的结束
 *
 * @param date 日期输入
 */
export function endOfWeek(date: DateInput): dayjs.Dayjs {
  return dayjs(date).endOf('week');
}

/**
 * 获取一月的开始
 *
 * @param date 日期输入
 */
export function startOfMonth(date: DateInput): dayjs.Dayjs {
  return dayjs(date).startOf('month');
}

/**
 * 获取一月的结束
 *
 * @param date 日期输入
 */
export function endOfMonth(date: DateInput): dayjs.Dayjs {
  return dayjs(date).endOf('month');
}

/**
 * 获取一年的开始
 *
 * @param date 日期输入
 */
export function startOfYear(date: DateInput): dayjs.Dayjs {
  return dayjs(date).startOf('year');
}

/**
 * 获取一年的结束
 *
 * @param date 日期输入
 */
export function endOfYear(date: DateInput): dayjs.Dayjs {
  return dayjs(date).endOf('year');
}

// ==================== 日期范围 ====================

/** 获取今天的日期范围 */
export function getTodayRange(): [dayjs.Dayjs, dayjs.Dayjs] {
  const today = dayjs();
  return [today.startOf('day'), today.endOf('day')];
}

/** 获取昨天的日期范围 */
export function getYesterdayRange(): [dayjs.Dayjs, dayjs.Dayjs] {
  const yesterday = dayjs().subtract(1, 'day');
  return [yesterday.startOf('day'), yesterday.endOf('day')];
}

/** 获取本周的日期范围 */
export function getThisWeekRange(): [dayjs.Dayjs, dayjs.Dayjs] {
  const today = dayjs();
  return [today.startOf('week'), today.endOf('week')];
}

/** 获取本月的日期范围 */
export function getThisMonthRange(): [dayjs.Dayjs, dayjs.Dayjs] {
  const today = dayjs();
  return [today.startOf('month'), today.endOf('month')];
}

/** 获取本年的日期范围 */
export function getThisYearRange(): [dayjs.Dayjs, dayjs.Dayjs] {
  const today = dayjs();
  return [today.startOf('year'), today.endOf('year')];
}

/**
 * 获取最近 N 天的日期范围
 *
 * @param days 天数
 */
export function getLastDaysRange(days: number): [dayjs.Dayjs, dayjs.Dayjs] {
  const today = dayjs();
  return [today.subtract(days - 1, 'day').startOf('day'), today.endOf('day')];
}
