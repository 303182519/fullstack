import { describe, expect, it } from 'vitest';
import { deepGet, deepSet, deepUnset, keyOfName, toSegments } from '../src/path';

describe('path utilities', () => {
  it('parses dot and bracket paths', () => {
    expect(toSegments('user.addresses[0].city')).toEqual(['user', 'addresses', 0, 'city']);
    expect(toSegments('items["sku.code"]')).toEqual(['items', 'sku.code']);
  });

  it('creates stable string keys from name paths', () => {
    expect(keyOfName(['user', 'name'])).toBe('user.name');
    expect(keyOfName('user.name')).toBe('user.name');
  });

  it('gets nested values with default fallback', () => {
    const value = { user: { name: 'Alex' } };

    expect(deepGet(value, 'user.name')).toBe('Alex');
    expect(deepGet(value, 'user.age', 18)).toBe(18);
  });

  it('sets nested values immutably', () => {
    const source = { user: { name: 'Alex' } };
    const next = deepSet(source, 'user.age', 18);

    expect(next).toEqual({ user: { age: 18, name: 'Alex' } });
    expect(source).toEqual({ user: { name: 'Alex' } });
    expect(next).not.toBe(source);
  });

  it('unsets object keys and array items immutably', () => {
    const source = { items: ['a', 'b'], user: { age: 18, name: 'Alex' } };

    expect(deepUnset(source, 'user.age')).toEqual({ items: ['a', 'b'], user: { name: 'Alex' } });
    expect(deepUnset(source, ['items', 0])).toEqual({ items: ['b'], user: { age: 18, name: 'Alex' } });
    expect(source).toEqual({ items: ['a', 'b'], user: { age: 18, name: 'Alex' } });
  });
});
