import type { LogUploadRequest } from '../src/index';
/** @vitest-environment node */
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { UPLOAD_TIMESTAMP_STORAGE_KEY, UploadManager } from '../src/index';
import { createMemoryAdapter, makeRecord } from './memory-adapter';
import { createMockMpFs, createWxLikeGlobal } from './mock-mp-runtime';

// ==================== localStorage 内存桩 ====================

const localStorageStore = new Map<string, string>();

vi.stubGlobal('localStorage', {
  getItem: (key: string) => localStorageStore.get(key) ?? null,
  setItem: (key: string, value: string) => {
    localStorageStore.set(key, value);
  },
  removeItem: (key: string) => {
    localStorageStore.delete(key);
  },
});

// ==================== MSW Server ====================

const BASE_URL = 'http://localhost:3000';
const UPLOAD_URL = `${BASE_URL}/api/log/upload`;

const server = setupServer();

beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

// ==================== UploadManager ====================

describe('uploadManager', () => {
  beforeEach(() => {
    localStorageStore.clear();
  });

  function seedLogs(count: number) {
    const adapter = createMemoryAdapter();
    const base = 1_700_000_000_000;
    for (let i = 1; i <= count; i++) {
      adapter.records.push(makeRecord(base + i * 1000));
    }
    return { adapter, lastTimestamp: base + count * 1000 };
  }

  it('应按 batchSize 分批上传全部日志并携带批次信息', async () => {
    const requests: LogUploadRequest[] = [];
    server.use(
      http.post(UPLOAD_URL, async ({ request }) => {
        requests.push((await request.json()) as LogUploadRequest);
        return HttpResponse.json({ success: true, receivedCount: 100 });
      }),
    );

    const { adapter } = seedLogs(250);
    const manager = new UploadManager({
      deviceId: 'dev-1',
      endpoint: UPLOAD_URL,
      adapter,
      platform: 'web',
      batchSize: 100,
    });

    const result = await manager.uploadAll();

    expect(result).toEqual({ success: true, uploadedCount: 250 });
    expect(requests).toHaveLength(3);
    expect(requests.map(r => r.batchIndex)).toEqual([0, 1, 2]);
    expect(requests[0].totalBatches).toBe(3);
    expect(requests[0].logs).toHaveLength(100);
    expect(requests[2].logs).toHaveLength(50);
    expect(requests[0].deviceId).toBe('dev-1');
  });

  it('headers 函数应每次请求调用并附加到请求头', async () => {
    const authHeaders: (string | null)[] = [];
    server.use(
      http.post(UPLOAD_URL, ({ request }) => {
        authHeaders.push(request.headers.get('Authorization'));
        return HttpResponse.json({ success: true, receivedCount: 100 });
      }),
    );

    let tokenSeq = 0;
    const { adapter } = seedLogs(150);
    const manager = new UploadManager({
      deviceId: 'dev-1',
      endpoint: UPLOAD_URL,
      adapter,
      platform: 'web',
      batchSize: 100,
      headers: () => ({ Authorization: `Bearer token-${++tokenSeq}` }),
    });

    const result = await manager.uploadAll();

    expect(result.success).toBe(true);
    expect(authHeaders).toEqual(['Bearer token-1', 'Bearer token-2']);
  });

  it('每批成功后应持久化最后上传时间戳，重建实例后从该进度继续上传', async () => {
    server.use(
      http.post(UPLOAD_URL, () => HttpResponse.json({ success: true, receivedCount: 100 })),
    );

    const { adapter, lastTimestamp } = seedLogs(150);
    const manager = new UploadManager({
      deviceId: 'dev-1',
      endpoint: UPLOAD_URL,
      adapter,
      platform: 'web',
      batchSize: 100,
    });

    await manager.uploadAll();

    // 每批成功后写入 localStorage，最终值 = 最后一批最后一条日志的时间戳
    expect(localStorageStore.get(UPLOAD_TIMESTAMP_STORAGE_KEY)).toBe(String(lastTimestamp));

    // 模拟重启：新实例首次上传前从平台存储懒加载恢复进度，不再全量重复上传
    const manager2 = new UploadManager({
      deviceId: 'dev-1',
      endpoint: UPLOAD_URL,
      adapter,
      platform: 'web',
      batchSize: 100,
    });

    // read 的 startTime 是闭区间（>=），边界上的最后一条日志会被重传 1 条；
    // 服务端可按日志 id 幂等去重（每条记录携带唯一 nanoid）
    const result = await manager2.uploadAll();
    expect(result).toEqual({ success: true, uploadedCount: 1 });
    expect(manager2.getStatus().lastUploadedTimestamp).toBe(lastTimestamp);
  });

  it('某批失败时应停止后续批次并返回已上传数量', async () => {
    let callCount = 0;
    server.use(
      http.post(UPLOAD_URL, () => {
        callCount += 1;
        if (callCount === 2) {
          return HttpResponse.json({ success: false, receivedCount: 0 });
        }
        return HttpResponse.json({ success: true, receivedCount: 100 });
      }),
    );
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const { adapter } = seedLogs(300);
    const manager = new UploadManager({
      deviceId: 'dev-1',
      endpoint: UPLOAD_URL,
      adapter,
      platform: 'web',
      batchSize: 100,
    });

    const result = await manager.uploadAll();

    expect(result).toEqual({ success: false, uploadedCount: 100 });
    expect(callCount).toBe(2);
  });

  it('无日志可上传时应直接成功返回 0，不发请求', async () => {
    let called = false;
    server.use(
      http.post(UPLOAD_URL, () => {
        called = true;
        return HttpResponse.json({ success: true, receivedCount: 0 });
      }),
    );

    const adapter = createMemoryAdapter();
    const manager = new UploadManager({ deviceId: 'dev-1', endpoint: UPLOAD_URL, adapter, platform: 'web' });

    const result = await manager.uploadAll();

    expect(result).toEqual({ success: true, uploadedCount: 0 });
    expect(called).toBe(false);
  });

  it('hTTP 非 2xx 应判定为上传失败', async () => {
    server.use(
      http.post(UPLOAD_URL, () => new HttpResponse(null, { status: 500 })),
    );
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const { adapter } = seedLogs(10);
    const manager = new UploadManager({ deviceId: 'dev-1', endpoint: UPLOAD_URL, adapter, platform: 'web' });

    const result = await manager.uploadAll();
    expect(result.success).toBe(false);
  });

  it('mini-program 平台应通过小程序 storage 持久化进度并在冷启动后恢复', async () => {
    const wxStore = new Map<string, string>();
    vi.stubGlobal('wx', createWxLikeGlobal(createMockMpFs().fs, wxStore));
    server.use(
      http.post(UPLOAD_URL, () => HttpResponse.json({ success: true, receivedCount: 100 })),
    );

    const { adapter, lastTimestamp } = seedLogs(150);
    const manager = new UploadManager({
      deviceId: 'dev-1',
      endpoint: UPLOAD_URL,
      adapter,
      platform: 'mini-program',
      batchSize: 100,
    });

    await manager.uploadAll();

    // 进度写入小程序 storage 而非 localStorage
    expect(wxStore.get(UPLOAD_TIMESTAMP_STORAGE_KEY)).toBe(String(lastTimestamp));
    expect(localStorageStore.get(UPLOAD_TIMESTAMP_STORAGE_KEY)).toBeUndefined();

    // 模拟冷启动：新实例首次上传前从小程序 storage 恢复进度
    const manager2 = new UploadManager({
      deviceId: 'dev-1',
      endpoint: UPLOAD_URL,
      adapter,
      platform: 'mini-program',
      batchSize: 100,
    });
    const result = await manager2.uploadAll();

    // 闭区间边界重传 1 条，服务端按日志 id 幂等去重
    expect(result).toEqual({ success: true, uploadedCount: 1 });
    expect(manager2.getStatus().lastUploadedTimestamp).toBe(lastTimestamp);

    vi.unstubAllGlobals();
  });
});
