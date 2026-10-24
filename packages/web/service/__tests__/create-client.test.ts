import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import { createQueryClient } from '../src/query/create-client';
import { DEFAULT_MUTATION_CONFIG, DEFAULT_QUERY_CONFIG } from '../src/query/defaults';

function noopOnError() {}

describe('createQueryClient', () => {
  it('returns a QueryClient instance with defaults', () => {
    const client = createQueryClient();
    expect(client).toBeInstanceOf(QueryClient);
  });

  it('uses DEFAULT_QUERY_CONFIG for queries', () => {
    const client = createQueryClient();
    const queryDefaults = client.getDefaultOptions().queries;
    expect(queryDefaults?.gcTime).toBe(DEFAULT_QUERY_CONFIG.gcTime);
    expect(queryDefaults?.staleTime).toBe(DEFAULT_QUERY_CONFIG.staleTime);
    expect(queryDefaults?.retry).toBe(DEFAULT_QUERY_CONFIG.retry);
    expect(queryDefaults?.refetchOnWindowFocus).toBe(false);
    expect(queryDefaults?.throwOnError).toBe(false);
  });

  it('uses DEFAULT_MUTATION_CONFIG for mutations', () => {
    const client = createQueryClient();
    const mutationDefaults = client.getDefaultOptions().mutations;
    expect(mutationDefaults?.gcTime).toBe(DEFAULT_MUTATION_CONFIG.gcTime);
    expect(mutationDefaults?.retry).toBe(DEFAULT_MUTATION_CONFIG.retry);
    expect(mutationDefaults?.throwOnError).toBe(false);
  });

  it('merges custom defaultOptions with built-in defaults', () => {
    const client = createQueryClient({
      defaultOptions: {
        queries: { retry: 5, staleTime: 60_000 },
      },
    });
    const queryDefaults = client.getDefaultOptions().queries;
    expect(queryDefaults?.staleTime).toBe(60_000);
    expect(queryDefaults?.retry).toBe(5);
    expect(queryDefaults?.gcTime).toBe(DEFAULT_QUERY_CONFIG.gcTime);
  });

  it('merges custom mutation options', () => {
    const client = createQueryClient({
      defaultOptions: {
        mutations: { retry: 3 },
      },
    });
    const mutationDefaults = client.getDefaultOptions().mutations;
    expect(mutationDefaults?.retry).toBe(3);
    expect(mutationDefaults?.gcTime).toBe(DEFAULT_MUTATION_CONFIG.gcTime);
  });

  it('accepts queryCache config', () => {
    const client = createQueryClient({ queryCache: { onError: noopOnError } });
    expect(client).toBeInstanceOf(QueryClient);
  });

  it('accepts mutationCache config', () => {
    const client = createQueryClient({ mutationCache: { onError: noopOnError } });
    expect(client).toBeInstanceOf(QueryClient);
  });

  it('works with empty options object', () => {
    const client = createQueryClient({});
    expect(client).toBeInstanceOf(QueryClient);
  });
});
