import type { DateInput } from './constants';
import { dayjs } from './dayjs';

// ==================== 时间戳转换 ====================

/**
 * 日期转时间戳（毫秒）
 *
 * @param date 日期输入
 */
export function toTimestamp(date: DateInput): number {
  if (!date)
    return 0;
  return dayjs(date).valueOf();
}

/**
 * 日期转时间戳（秒）
 *
 * @param date 日期输入
 */
export function toUnixTimestamp(date: DateInput): number {
  if (!date)
    return 0;
  return dayjs(date).unix();
}

// ==================== 日期计算 ====================

/**
 * 日期加法
 *
 * @param date 日期输入
 * @param value 增加的值
 * @param unit 单位：day/month/year/hour/minute/second
 */
export function addDate(date: DateInput, value: number, unit: dayjs.ManipulateType = 'day'): dayjs.Dayjs {
  return dayjs(date).add(value, unit);
}

/**
 * 日期减法
 *
 * @param date 日期输入
 * @param value 减少的值
 * @param unit 单位：day/month/year/hour/minute/second
 */
export function subtractDate(date: DateInput, value: number, unit: dayjs.ManipulateType = 'day'): dayjs.Dayjs {
  return dayjs(date).subtract(value, unit);
}

/**
 * 计算两个日期之间的差值
 *
 * @param date1 日期1
 * @param date2 日期2
 * @param unit 单位：day/month/year/hour/minute/second
 */
export function diffDate(date1: DateInput, date2: DateInput, unit: dayjs.ManipulateType = 'day'): number {
  return dayjs(date1).diff(dayjs(date2), unit);
}

// ==================== 相对时间 ====================

/**
 * 获取相对时间描述（如：3天前、2小时后）
 *
 * @param date 日期输入
 * @param baseDate 基准日期，默认当前时间
 */
export function fromNow(date: DateInput, baseDate?: DateInput): string {
  if (!date)
    return '';
  const d = dayjs(date);
  if (baseDate) {
    return d.from(dayjs(baseDate));
  }
  return d.fromNow();
}

/**
 * 获取到某个时间的相对描述（如：3天后）
 *
 * @param date 日期输入
 * @param baseDate 基准日期，默认当前时间
 */
export function toNow(date: DateInput, baseDate?: DateInput): string {
  if (!date)
    return '';
  const d = dayjs(date);
  if (baseDate) {
    return d.to(dayjs(baseDate));
  }
  return d.toNow();
}
