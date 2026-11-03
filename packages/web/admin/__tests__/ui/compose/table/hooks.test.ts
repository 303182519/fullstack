import type { TableColumnCheck } from '../../../../src/ui/compose/table/types';

import { describe, expect, it } from 'vitest';

import { formatSearchParams, mergeColumnChecks } from '../../../../src/ui/compose/table/hooks';

describe('formatSearchParams', () => {
  it('空对象 → 空对象', () => {
    expect(formatSearchParams({})).toEqual({});
  });

  it('全 null/undefined → 空对象', () => {
    expect(formatSearchParams({ a: null, b: undefined })).toEqual({});
  });

  it('保留 falsy 值 0、false、空字符串', () => {
    expect(formatSearchParams({ a: 0, b: false, c: '' })).toEqual({ a: 0, b: false, c: '' });
  });

  it('混合场景：过滤 null/undefined，保留有效值', () => {
    expect(formatSearchParams({
      name: 'Alice',
      age: undefined,
      tag: null,
      count: 0,
      enabled: false,
    })).toEqual({ name: 'Alice', count: 0, enabled: false });
  });

  it('不传参 → 空对象', () => {
    expect(formatSearchParams()).toEqual({});
  });
});

describe('mergeColumnChecks', () => {
  function makeCheck(key: string, overrides: Partial<TableColumnCheck> = {}): TableColumnCheck {
    return {
      key,
      title: key,
      checked: true,
      fixed: 'unFixed',
      visible: true,
      ...overrides,
    };
  }

  describe('保留已有偏好', () => {
    it('新列全部默认，旧列有偏好 → 旧偏好保留', () => {
      const current = [
        makeCheck('id', { checked: false, fixed: 'left' }),
        makeCheck('name', { checked: true }),
      ];
      const next = [
        makeCheck('id'),
        makeCheck('name'),
        makeCheck('createdAt'),
      ];
      const result = mergeColumnChecks(current, next);
      expect(result.find(c => c.key === 'id')).toMatchObject({ checked: false, fixed: 'left' });
      expect(result.find(c => c.key === 'name')).toMatchObject({ checked: true, fixed: 'unFixed' });
      // 新增列用默认值
      expect(result.find(c => c.key === 'createdAt')).toMatchObject({ checked: true, fixed: 'unFixed' });
    });
  });

  describe('列从 next 消失（被移除）', () => {
    it('旧列不在 next 中 → 不出现（以 next 为准）', () => {
      const current = [makeCheck('a'), makeCheck('b')];
      const next = [makeCheck('a')];
      const result = mergeColumnChecks(current, next);
      expect(result).toHaveLength(1);
      expect(result[0]!.key).toBe('a');
    });
  });

  describe('排序保留', () => {
    it('next 新增列追加到末尾', () => {
      const current = [makeCheck('a'), makeCheck('b')];
      const next = [makeCheck('a'), makeCheck('b'), makeCheck('c')];
      const result = mergeColumnChecks(current, next);
      expect(result.map(c => c.key)).toEqual(['a', 'b', 'c']);
    });

    it('next 重排顺序被忽略，以 current 中的顺序为准（用户手动排序不被 columnsFactory 重置覆盖）', () => {
      const current = [makeCheck('a', { checked: false }), makeCheck('b')];
      // next 顺序反了，但用户上次是 a 在前 b 在后
      const next = [makeCheck('b'), makeCheck('a')];
      const result = mergeColumnChecks(current, next);
      // 保留用户的排序 a → b
      expect(result.map(c => c.key)).toEqual(['a', 'b']);
      // 同时保留用户偏好
      expect(result.find(c => c.key === 'a')!.checked).toBe(false);
    });
  });

  describe('空 current / 空 next', () => {
    it('current 空 → 直接用 next', () => {
      const result = mergeColumnChecks([], [makeCheck('x'), makeCheck('y', { checked: false })]);
      expect(result).toEqual([makeCheck('x'), makeCheck('y', { checked: false })]);
    });

    it('next 空 → 空', () => {
      const result = mergeColumnChecks([makeCheck('a', { checked: false })], []);
      expect(result).toEqual([]);
    });
  });
});
