import { isArray } from 'radash';
import { isNil } from './utils';

export function toArray<T>(value?: T | T[] | null): T[] {
  if (isNil(value)) {
    return [];
  }

  return isArray(value) ? value : [value];
}

// type Diff<T = any> = T;

// 比较两个数组是否相等

export function arraysEqual<T>(a: T[], b: T[]): boolean {
  if (a.length !== b.length)
    return false;
  const counter = new Map<T, number>();
  for (const value of a) {
    counter.set(value, (counter.get(value) || 0) + 1);
  }
  for (const value of b) {
    const count = counter.get(value);
    if (count === undefined || count === 0) {
      return false;
    }
    counter.set(value, count - 1);
  }
  return true;
}
