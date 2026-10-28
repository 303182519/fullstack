import { isDate, isObject } from 'radash';
import { arraysEqual } from './array';

export function shallowEqual(a: any, b: any): boolean {
  if (Object.is(a, b))
    return true;

  // 数组单独处理：radash 的 isObject 会把数组排除，且这里需要按顺序逐元素浅比较，
  // 不能复用 arraysEqual（它是无序多重集比较）。
  const aIsArray = Array.isArray(a);
  const bIsArray = Array.isArray(b);
  if (aIsArray || bIsArray) {
    if (!aIsArray || !bIsArray || a.length !== b.length)
      return false;
    for (let i = 0; i < a.length; i++) {
      if (!Object.is(a[i], b[i]))
        return false;
    }
    return true;
  }

  if (!isObject(a) || !isObject(b))
    return false;

  const objA = a as Record<string, unknown>;
  const objB = b as Record<string, unknown>;

  const ka = Object.keys(objA);

  const kb = Object.keys(objB);

  if (ka.length !== kb.length)
    return false;

  for (const k of ka) {
    // 必须确认 key 真实存在于 b，否则 { x: undefined } 与 { y: undefined } 会被误判为相等。
    if (!Object.hasOwn(objB, k) || !Object.is(objA[k], objB[k]))
      return false;
  }

  return true;
}

/**
 * 是否为对象类型。
 *
 * 注意必须排除 `null`：`typeof null === 'object'`，不排的话这个类型谓词会把 `null` 收窄成 `object`，下游任何属性访问都可能在运行期炸掉。
 */
export const isObjectType = (value: unknown): value is object => typeof value === 'object' && value !== null;

/**
 * 是否为「事件形状」的对象。
 *
 * 用于表单取值：受控组件的 onChange 第一个参数既可能是原生/合成事件，也可能是裸值。 这里只做形状判断 —— 非 null 的非数组、非 Date 对象都算，plain object（`{ target: ...
 * }`）同样算。
 */
export function isEventObject(event: unknown): event is Record<string, unknown> {
  return isObjectType(event) && !Array.isArray(event) && !isDate(event);
}

// function diff<T extends object>(
//   oldObj: T,
//   newObj: T,
//   ignoreFields: (keyof T)[] = [],
// ): { [K in keyof T]?: Diff<T[K]> } | null {
//   const difference: { [K in keyof T]?: Diff<T[K]> } = {};

//   for (const key in oldObj) {
//     if (ignoreFields.includes(key)) continue;
//     const oldValue = oldObj[key];
//     const newValue = newObj[key];

//     if (!deepEqual(oldValue, newValue)) {
//       difference[key] = newValue;
//     }
//   }

//   return Object.keys(difference).length === 0 ? null : difference;
// }

type DiffResult<T> = Partial<{
  [K in keyof T]: T[K] extends object ? DiffResult<T[K]> : T[K];
}>;

export function diff<T extends Record<string, any>>(obj1: T, obj2: T): DiffResult<T> {
  function findDifferences(o1: any, o2: any): any {
    if (Array.isArray(o1) && Array.isArray(o2)) {
      if (!arraysEqual(o1, o2)) {
        return o2;
      }
      return undefined;
    }

    if (typeof o1 === 'object' && typeof o2 === 'object' && o1 !== null && o2 !== null) {
      const diffResult: any = {};

      const keys = new Set([...Object.keys(o1), ...Object.keys(o2)]);
      keys.forEach((key) => {
        const valueDiff = findDifferences(o1[key], o2[key]);
        if (valueDiff !== undefined) {
          diffResult[key] = valueDiff;
        }
      });

      return Object.keys(diffResult).length > 0 ? diffResult : undefined;
    }

    return o1 === o2 ? undefined : o2;
  }

  return findDifferences(obj1, obj2);
}
