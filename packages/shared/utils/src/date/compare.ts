import type { DateInput } from './constants';
import { dayjs } from './dayjs';

/**
 * 判断是否为有效日期
 *
 * @param date 日期输入
 */
export function isValidDate(date: DateInput): boolean {
  return dayjs(date).isValid();
}

/**
 * 判断日期是否在某个日期之前
 *
 * @param date 日期输入
 * @param compareDate 比较日期
 */
export function isBefore(date: DateInput, compareDate: DateInput): boolean {
  return dayjs(date).isBefore(dayjs(compareDate));
}

/**
 * 判断日期是否在某个日期之后
 *
 * @param date 日期输入
 * @param compareDate 比较日期
 */
export function isAfter(date: DateInput, compareDate: DateInput): boolean {
  return dayjs(date).isAfter(dayjs(compareDate));
}

/**
 * 判断两个日期是否相同
 *
 * @param date1 日期1
 * @param date2 日期2
 * @param unit 比较精度
 */
export function isSame(date1: DateInput, date2: DateInput, unit?: dayjs.OpUnitType): boolean {
  return dayjs(date1).isSame(dayjs(date2), unit);
}

/**
 * 判断是否是今天
 *
 * @param date 日期输入
 */
export function isToday(date: DateInput): boolean {
  return dayjs(date).isSame(dayjs(), 'day');
}

/**
 * 判断是否是昨天
 *
 * @param date 日期输入
 */
export function isYesterday(date: DateInput): boolean {
  return dayjs(date).isSame(dayjs().subtract(1, 'day'), 'day');
}

/**
 * 判断是否是明天
 *
 * @param date 日期输入
 */
export function isTomorrow(date: DateInput): boolean {
  return dayjs(date).isSame(dayjs().add(1, 'day'), 'day');
}
