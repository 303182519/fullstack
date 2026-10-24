import { describe, expect, it } from 'vitest';
import { DEFAULT_MUTATION_CONFIG, DEFAULT_QUERY_CONFIG } from '../src/query/defaults';

describe('dEFAULT_QUERY_CONFIG', () => {
  it('has expected default values', () => {
    expect(DEFAULT_QUERY_CONFIG.gcTime).toBe(10 * 60 * 1000);
    expect(DEFAULT_QUERY_CONFIG.networkMode).toBe('online');
    expect(DEFAULT_QUERY_CONFIG.refetchOnMount).toBe(true);
    expect(DEFAULT_QUERY_CONFIG.refetchOnReconnect).toBe(true);
    expect(DEFAULT_QUERY_CONFIG.refetchOnWindowFocus).toBe(false);
    expect(DEFAULT_QUERY_CONFIG.retry).toBe(2);
    expect(DEFAULT_QUERY_CONFIG.retryOnMount).toBe(true);
    expect(DEFAULT_QUERY_CONFIG.staleTime).toBe(30 * 1000);
    expect(DEFAULT_QUERY_CONFIG.throwOnError).toBe(false);
  });

  it('retryDelay uses exponential backoff capped at 30s', () => {
    expect(DEFAULT_QUERY_CONFIG.retryDelay(0)).toBe(1000);
    expect(DEFAULT_QUERY_CONFIG.retryDelay(1)).toBe(2000);
    expect(DEFAULT_QUERY_CONFIG.retryDelay(2)).toBe(4000);
    expect(DEFAULT_QUERY_CONFIG.retryDelay(3)).toBe(8000);
    expect(DEFAULT_QUERY_CONFIG.retryDelay(4)).toBe(16000);
    expect(DEFAULT_QUERY_CONFIG.retryDelay(5)).toBe(30000);
    expect(DEFAULT_QUERY_CONFIG.retryDelay(10)).toBe(30000);
  });
});

describe('dEFAULT_MUTATION_CONFIG', () => {
  it('has expected default values', () => {
    expect(DEFAULT_MUTATION_CONFIG.gcTime).toBe(60 * 1000);
    expect(DEFAULT_MUTATION_CONFIG.networkMode).toBe('online');
    expect(DEFAULT_MUTATION_CONFIG.retry).toBe(1);
    expect(DEFAULT_MUTATION_CONFIG.throwOnError).toBe(false);
  });

  it('retryDelay uses exponential backoff capped at 10s', () => {
    expect(DEFAULT_MUTATION_CONFIG.retryDelay(0)).toBe(1000);
    expect(DEFAULT_MUTATION_CONFIG.retryDelay(1)).toBe(2000);
    expect(DEFAULT_MUTATION_CONFIG.retryDelay(2)).toBe(4000);
    expect(DEFAULT_MUTATION_CONFIG.retryDelay(3)).toBe(8000);
    expect(DEFAULT_MUTATION_CONFIG.retryDelay(4)).toBe(10000);
    expect(DEFAULT_MUTATION_CONFIG.retryDelay(10)).toBe(10000);
  });
});
