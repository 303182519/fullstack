import { describe, expect, it, vi } from 'vitest';
import { decode, encodeQueryKey, encodeQueryValue, parseQuery, stringifyQuery } from '../src';

describe('query utilities', () => {
  it('parses empty query strings', () => {
    expect(parseQuery('')).toEqual({});
    expect(parseQuery('?')).toEqual({});
  });

  it('parses query strings with and without a leading question mark', () => {
    expect(parseQuery('?name=Alex&age=18')).toEqual({ age: '18', name: 'Alex' });
    expect(parseQuery('name=Alex&age=18')).toEqual({ age: '18', name: 'Alex' });
  });

  it('parses repeated keys, null values, empty values and equals signs in values', () => {
    expect(parseQuery('?tag=a&tag=b&tag=c&enabled&empty=&token=a=b')).toEqual({
      empty: '',
      enabled: null,
      tag: ['a', 'b', 'c'],
      token: 'a=b',
    });
  });

  it('decodes plus signs as spaces while preserving encoded plus signs', () => {
    expect(parseQuery('?keyword=hello+world&symbol=%2B')).toEqual({
      keyword: 'hello world',
      symbol: '+',
    });
  });

  it('skips empty query segments but keeps explicit empty keys', () => {
    expect(parseQuery('?a=1&&b=2&')).toEqual({ a: '1', b: '2' });
    expect(parseQuery('?=value&')).toEqual({ '': 'value' });
  });

  it('keeps prototype names as normal query keys', () => {
    const protoKey = ['__', 'proto__'].join('');
    const query = parseQuery('?toString=a&constructor=b&__proto__=c');

    expect(Object.getPrototypeOf(query)).toBeNull();
    expect(Object.hasOwn(query, 'toString')).toBe(true);
    expect(Object.hasOwn(query, 'constructor')).toBe(true);
    expect(Object.hasOwn(query, protoKey)).toBe(true);
    expect(query.toString).toBe('a');
    expect(query.constructor).toBe('b');
    expect(query[protoKey]).toBe('c');
  });

  it('stringifies scalar, null and array values', () => {
    expect(
      stringifyQuery({
        empty: '',
        nil: null,
        page: 0,
        skip: undefined,
        tag: ['a', null, undefined, 0, ''],
      }),
    ).toBe('?empty=&nil&page=0&tag=a&tag&tag=0&tag=');
  });

  it('returns an empty string when there are no serializable values', () => {
    expect(stringifyQuery({})).toBe('');
    expect(stringifyQuery({ list: [undefined], skip: undefined })).toBe('');
  });

  it('encodes query keys and values with URL-search compatible semantics', () => {
    expect(encodeQueryKey('a=b')).toBe('a%3Db');
    expect(encodeQueryValue('a b+c#d&e')).toBe('a+b%2Bc%23d%26e');
  });

  it('falls back to the original text when decoding fails', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    expect(decode('%E0%A4%A')).toBe('%E0%A4%A');
    expect(warn).toHaveBeenCalledWith('Error decoding "%E0%A4%A". Using original value');

    warn.mockRestore();
  });
});
