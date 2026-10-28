import { describe, expect, it } from 'vitest';
import { deepGet } from '../src/get';

describe('deepGet', () => {
  const source = {
    items: [{ title: 'First' }],
    profile: {
      age: undefined,
      name: 'Alex',
      nullable: null,
    },
  };

  it('reads nested values from dot paths and tuple paths', () => {
    expect(deepGet(source, 'profile.name')).toBe('Alex');
    expect(deepGet(source, ['items', 0, 'title'])).toBe('First');
  });

  it('reads array indexes from bracket paths', () => {
    expect(deepGet(source, 'items[0].title')).toBe('First');
  });

  it('returns the default value for nullish or empty paths', () => {
    expect(deepGet(source, null, 'fallback')).toBe('fallback');
    expect(deepGet(source, undefined, 'fallback')).toBe('fallback');
    expect(deepGet(source, [], 'fallback')).toBe('fallback');
  });

  it('returns the default value when the path cannot be resolved', () => {
    expect(deepGet(source, 'profile.missing', 'fallback')).toBe('fallback');
    expect(deepGet(source, 'profile.age', 'fallback')).toBe('fallback');
    expect(deepGet(1, 'profile.name', 'fallback')).toBe('fallback');
  });

  it('keeps explicit null values', () => {
    expect(deepGet(source, 'profile.nullable', 'fallback')).toBeNull();
  });
});
