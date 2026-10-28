import type { DateInput } from './constants';
import { DATE_FORMAT } from './constants';
import { dayjs } from './dayjs';

/**
 * 格式化日期
 *
 * @param date 日期输入
 * @param format 格式化模板，默认 YYYY-MM-DD
 */
export function formatDate(date: DateInput, format: string = DATE_FORMAT.DATE): string {
  if (!date)
    return '';
  return dayjs(date).format(format);
}

/**
 * 格式化日期时间
 *
 * @param date 日期输入
 * @param format 格式化模板，默认 YYYY-MM-DD HH:mm:ss
 */
export function formatDateTime(date: DateInput, format: string = DATE_FORMAT.DATE_TIME): string {
  if (!date)
    return '';
  return dayjs(date).format(format);
}

/**
 * 格式化时间
 *
 * @param date 日期输入
 * @param format 格式化模板，默认 HH:mm:ss
 */
export function formatTime(date: DateInput, format: string = DATE_FORMAT.TIME): string {
  if (!date)
    return '';
  return dayjs(date).format(format);
}

/**
 * 时间戳转日期字符串
 *
 * @param timestamp 时间戳（毫秒或秒）
 * @param format 格式化模板
 */
export function fromTimestamp(timestamp: number, format: string = DATE_FORMAT.DATE_TIME): string {
  if (!timestamp)
    return '';
  // 自动判断是秒还是毫秒
  const ts = timestamp < 10000000000 ? timestamp * 1000 : timestamp;
  return dayjs(ts).format(format);
}

/**
 * 格式化持续时间（毫秒转为可读格式）
 *
 * @param milliseconds 毫秒数
 * @param format 格式化模板
 */
export function formatDuration(milliseconds: number, format: string = 'HH:mm:ss'): string {
  return dayjs.duration(milliseconds).format(format);
}

/**
 * 获取持续时间的人性化描述
 *
 * @param milliseconds 毫秒数
 */
export function humanizeDuration(milliseconds: number): string {
  return dayjs.duration(milliseconds).humanize();
}
