/** @vitest-environment node */
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { WhitelistManager } from '../src/index';

// ==================== MSW Server ====================

const BASE_URL = 'http://localhost:3000';
const WHITELIST_URL = `${BASE_URL}/api/log/whitelist`;

const server = setupServer();

beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

// ==================== WhitelistManager ====================

describe('whitelistManager', () => {
  it('设备在启用白名单中时 check 应返回 true', async () => {
    server.use(
      http.post(WHITELIST_URL, () => {
        return HttpResponse.json({ enabled: true, deviceIds: ['dev-1', 'dev-2'] });
      }),
    );

    const manager = new WhitelistManager({ deviceId: 'dev-1', endpoint: WHITELIST_URL });
    expect(await manager.check()).toBe(true);
    expect(manager.getStatus()).toBe(true);
  });

  it('全局停用或设备不在列表中时 check 应返回 false', async () => {
    server.use(
      http.post(WHITELIST_URL, () => {
        return HttpResponse.json({ enabled: false, deviceIds: ['dev-1'] });
      }),
    );

    const manager = new WhitelistManager({ deviceId: 'dev-1', endpoint: WHITELIST_URL });
    expect(await manager.check()).toBe(false);
  });

  it('首次加入白名单时触发 onWhitelisted，再次检查不重复触发', async () => {
    let enabled = false;
    server.use(
      http.post(WHITELIST_URL, () => {
        return HttpResponse.json({ enabled, deviceIds: ['dev-1'] });
      }),
    );

    const onWhitelisted = vi.fn();
    const manager = new WhitelistManager({
      deviceId: 'dev-1',
      endpoint: WHITELIST_URL,
      onWhitelisted,
    });

    await manager.check();
    expect(onWhitelisted).not.toHaveBeenCalled();

    enabled = true;
    await manager.check();
    expect(onWhitelisted).toHaveBeenCalledTimes(1);

    await manager.check();
    expect(onWhitelisted).toHaveBeenCalledTimes(1);
  });

  it('静态 headers 应附加到请求头，请求体携带 deviceId', async () => {
    let capturedAuth: string | null = null;
    let capturedBody: unknown = null;
    server.use(
      http.post(WHITELIST_URL, async ({ request }) => {
        capturedAuth = request.headers.get('Authorization');
        capturedBody = await request.json();
        return HttpResponse.json({ enabled: true, deviceIds: [] });
      }),
    );

    const manager = new WhitelistManager({
      deviceId: 'dev-9',
      endpoint: WHITELIST_URL,
      headers: { Authorization: 'Bearer static-token' },
    });

    await manager.check();

    expect(capturedAuth).toBe('Bearer static-token');
    expect(capturedBody).toEqual({ deviceId: 'dev-9' });
  });

  it('接口异常时应保持上次状态而不抛出', async () => {
    server.use(
      http.post(WHITELIST_URL, () => new HttpResponse(null, { status: 503 })),
    );
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const manager = new WhitelistManager({ deviceId: 'dev-1', endpoint: WHITELIST_URL });
    expect(await manager.check()).toBe(false);
    vi.restoreAllMocks();
  });
});
