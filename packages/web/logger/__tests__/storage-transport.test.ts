/** @vitest-environment node */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StorageTransport } from '../src/index';
import { createMemoryAdapter } from './memory-adapter';

// ==================== 辅助工具 ====================

const FLUSH_INTERVAL = 60_000;

function shipMessages(transport: StorageTransport, count: number, startIndex = 0) {
  for (let i = 0; i < count; i++) {
    transport.shipToLogger({
      logLevel: 'info',
      messages: [`msg-${startIndex + i}`],
      hasData: false,
    });
  }
}

// ==================== StorageTransport ====================

describe('storageTransport', () => {
  const disposables: StorageTransport[] = [];

  function createTransport(adapter: ReturnType<typeof createMemoryAdapter>, bufferSize = 5) {
    const transport = new StorageTransport({ adapter, bufferSize, flushInterval: FLUSH_INTERVAL });
    disposables.push(transport);
    return transport;
  }

  afterEach(async () => {
    // dispose 会停掉定时器并冲刷残余缓冲，避免测试间泄漏
    for (const transport of disposables.splice(0)) {
      await transport.dispose();
    }
    vi.restoreAllMocks();
  });

  it('shipToLogger 应缓冲日志，手动 flush 后批量写入适配器', async () => {
    const adapter = createMemoryAdapter();
    const transport = createTransport(adapter);

    shipMessages(transport, 3);
    expect(adapter.records).toHaveLength(0);

    await transport.flush();
    expect(adapter.records).toHaveLength(3);
    expect(adapter.records[0].message).toBe('msg-0');
  });

  it('缓冲达到 bufferSize 时应自动触发 flush', async () => {
    const adapter = createMemoryAdapter();
    const transport = createTransport(adapter, 2);

    shipMessages(transport, 2);

    // 自动 flush 是 void 触发的异步操作，等待其完成
    await vi.waitFor(() => {
      expect(adapter.records).toHaveLength(2);
    });
    expect(transport).toBeTruthy();
  });

  it('flush 失败时应把日志放回缓冲区，下次 flush 重试', async () => {
    const adapter = createMemoryAdapter();
    const transport = createTransport(adapter);
    vi.spyOn(console, 'error').mockImplementation(() => {});

    adapter.failWrites = true;
    shipMessages(transport, 3);
    await transport.flush();
    expect(adapter.records).toHaveLength(0);

    adapter.failWrites = false;
    await transport.flush();
    expect(adapter.records).toHaveLength(3);
  });

  it('缓冲区超过硬上限（10×bufferSize）时应丢弃最旧日志并仅告警一次', async () => {
    // 用可控的延迟写入阻塞 flush，让缓冲区持续积压
    const adapter = createMemoryAdapter();
    let releaseWrite: (() => void) | null = null;
    adapter.writeBatch = (batch) => {
      if (!releaseWrite) {
        return new Promise<void>((resolve) => {
          releaseWrite = () => {
            adapter.records.push(...batch);
            resolve();
          };
        });
      }
      adapter.records.push(...batch);
      return Promise.resolve();
    };

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    // bufferSize = 5 → 硬上限 50
    const transport = createTransport(adapter, 5);

    // 前 5 条触发首次 flush（被阻塞），随后 55 条持续积压 → 溢出 5 条
    shipMessages(transport, 60);

    expect(warnSpy).toHaveBeenCalledTimes(1);

    // 放行首次 flush，再冲刷剩余缓冲
    releaseWrite!();
    await vi.waitFor(async () => {
      await transport.flush();
      expect(adapter.records.length).toBeGreaterThan(0);
    });
    await transport.flush();

    // 总写入 60 - 5（丢弃）= 55：首批 5 条 + 缓冲中较新的 50 条
    expect(adapter.records).toHaveLength(55);
    const messages = adapter.records.map(r => r.message);
    expect(messages).toContain('msg-0');
    expect(messages).not.toContain('msg-6');
    expect(messages).toContain('msg-59');
  });

  it('data 中的 Error 应被序列化到 error 字段，_context 应提取为 context', async () => {
    const adapter = createMemoryAdapter();
    const transport = createTransport(adapter);

    transport.shipToLogger({
      logLevel: 'error',
      messages: ['operation failed'],
      hasData: true,
      data: {
        err: new Error('timeout'),
        _context: { module: 'auth' },
        userId: '123',
      },
    });

    await transport.flush();

    const record = adapter.records[0];
    expect(record.level).toBe('error');
    expect(record.error?.message).toBe('timeout');
    expect(record.context).toEqual({ module: 'auth' });
    // 上游既有行为：Error 被序列化到 error 字段后，原始 Error 对象仍保留在 data 中（不移除）
    expect(record.data?.userId).toBe('123');
    expect(record.data?.err).toBeInstanceOf(Error);
  });

  it('dispose 应冲刷残余缓冲并停止定时器', async () => {
    const adapter = createMemoryAdapter();
    const transport = createTransport(adapter);

    shipMessages(transport, 2);
    await transport.dispose();

    expect(adapter.records).toHaveLength(2);
  });
});
