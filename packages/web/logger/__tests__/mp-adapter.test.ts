import type { MockMpFs } from './mock-mp-runtime';
/** @vitest-environment node */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MPStorageAdapter } from '../src/index';
import { makeRecord } from './memory-adapter';
import { createMockMpFs } from './mock-mp-runtime';

// ==================== 测试基座 ====================

const ROOT = '/mock_user_data/fedstack_logs';

// 本地时区构造时间戳（取白天时段，避免 ±时区 跨日期边界）
const day1 = new Date(2026, 0, 10, 10, 0, 0).getTime();
const day1Later = new Date(2026, 0, 10, 14, 0, 0).getTime();
const day2 = new Date(2026, 0, 11, 9, 0, 0).getTime();
const day2Later = new Date(2026, 0, 11, 18, 0, 0).getTime();
const day3 = new Date(2026, 0, 12, 8, 0, 0).getTime();

function dateStringOf(timestamp: number): string {
  const date = new Date(timestamp);
  const yyyy = date.getFullYear();
  const MM = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${MM}-${dd}`;
}

function createAdapter(mock: MockMpFs): MPStorageAdapter {
  return new MPStorageAdapter({ fs: mock.fs, rootPath: ROOT });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// ==================== MPStorageAdapter ====================

describe('mpStorageAdapter', () => {
  it('init 时目录不存在则创建，重复 init 幂等', async () => {
    const mock = createMockMpFs();
    const adapter = createAdapter(mock);

    await adapter.init();
    expect(mock.mkdirCalls).toEqual([ROOT]);

    await adapter.init();
    expect(mock.mkdirCalls).toEqual([ROOT]);
  });

  it('init 时目录已有内容则不重复创建', async () => {
    const mock = createMockMpFs();
    mock.files.set(`${ROOT}/2026-01-01.jsonl`, '');
    const adapter = createAdapter(mock);

    await adapter.init();
    expect(mock.mkdirCalls).toEqual([]);
  });

  it('write 写入后可读回，同日记录写入同一日期文件', async () => {
    const mock = createMockMpFs();
    const adapter = createAdapter(mock);

    await adapter.write(makeRecord(day1));
    await adapter.write(makeRecord(day1Later));

    expect(mock.files.size).toBe(1);
    expect(await adapter.count()).toBe(2);
    const all = await adapter.read();
    expect(all.map(r => r.timestamp)).toEqual([day1, day1Later]);
  });

  it('writeBatch 跨天记录分组写入不同日期文件', async () => {
    const mock = createMockMpFs();
    const adapter = createAdapter(mock);

    await adapter.writeBatch([makeRecord(day1), makeRecord(day2), makeRecord(day2Later)]);

    expect(mock.files.size).toBe(2);
    const all = await adapter.read();
    expect(all.map(r => r.timestamp)).toEqual([day1, day2, day2Later]);
  });

  it('read 按文件名预过滤日期范围，行级按 timestamp 精确过滤', async () => {
    const mock = createMockMpFs();
    const adapter = createAdapter(mock);
    await adapter.writeBatch([makeRecord(day1), makeRecord(day1Later), makeRecord(day2), makeRecord(day2Later)]);

    // 只读 day2 中午之后：day1 文件被文件名预过滤排除，day2 文件行级过滤
    const afternoon = await adapter.read(new Date(2026, 0, 11, 12, 0, 0).getTime());
    expect(afternoon.map(r => r.timestamp)).toEqual([day2Later]);

    // 闭区间跨天
    const cross = await adapter.read(day1Later, day2);
    expect(cross.map(r => r.timestamp)).toEqual([day1Later, day2]);
  });

  it('deleteBeforeTime 整天删除旧文件并重写边界文件', async () => {
    const mock = createMockMpFs();
    const adapter = createAdapter(mock);
    await adapter.writeBatch([
      makeRecord(day1),
      makeRecord(day1Later),
      makeRecord(day2),
      makeRecord(day2Later),
      makeRecord(day3),
    ]);

    const noon2 = new Date(2026, 0, 11, 12, 0, 0).getTime();
    const deleted = await adapter.deleteBeforeTime(noon2);

    // day1 文件整天删（2 条）+ day2 文件上午 1 条被重写剔除
    expect(deleted).toBe(3);
    expect(mock.files.size).toBe(2);
    const rest = await adapter.read();
    expect(rest.map(r => r.timestamp)).toEqual([day2Later, day3]);
  });

  it('deleteBeforeTime 边界文件无剩余记录时直接删除文件', async () => {
    const mock = createMockMpFs();
    const adapter = createAdapter(mock);
    await adapter.writeBatch([makeRecord(day1), makeRecord(day1Later)]);

    const deleted = await adapter.deleteBeforeTime(day3);

    expect(deleted).toBe(2);
    expect(mock.files.size).toBe(0);
  });

  it('损坏行跳过，不影响其余日志读取', async () => {
    const mock = createMockMpFs();
    const adapter = createAdapter(mock);
    const fileName = `${dateStringOf(day1)}.jsonl`;
    mock.files.set(
      `${ROOT}/${fileName}`,
      `${JSON.stringify(makeRecord(day1))}\nnot-json-line\n{"broken":\n`,
    );

    const all = await adapter.read();
    expect(all).toHaveLength(1);
    expect(all[0].timestamp).toBe(day1);
  });

  it('append 写满时删除最旧日期文件后重试', async () => {
    const mock = createMockMpFs();
    const adapter = createAdapter(mock);
    await adapter.writeBatch([makeRecord(day1), makeRecord(day2)]);

    mock.failNextAppend();
    await adapter.write(makeRecord(day3));

    // day1 文件被紧急清理，day3 重试写入成功
    expect(mock.files.size).toBe(2);
    const all = await adapter.read();
    expect(all.map(r => r.timestamp)).toEqual([day2, day3]);
  });

  it('紧急清理后重试仍失败时向上抛错', async () => {
    const mock = createMockMpFs();
    const adapter = createAdapter(mock);
    mock.failAlwaysAppend();

    await expect(adapter.write(makeRecord(day1))).rejects.toThrow();
  });

  it('clear 删除全部日志文件', async () => {
    const mock = createMockMpFs();
    const adapter = createAdapter(mock);
    await adapter.writeBatch([makeRecord(day1), makeRecord(day2), makeRecord(day2Later)]);
    expect(await adapter.count()).toBe(3);

    await adapter.clear();

    expect(await adapter.count()).toBe(0);
    expect(mock.files.size).toBe(0);
  });

  it('探测不到小程序运行时时 warn 一次并退化为无操作', async () => {
    // node 环境无 wx/my/tt/swan/qq 全局，detectMPRuntime 返回 null
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const adapter = new MPStorageAdapter();

    await adapter.write(makeRecord(day1));
    await adapter.writeBatch([makeRecord(day2)]);

    expect(await adapter.read()).toEqual([]);
    expect(await adapter.count()).toBe(0);
    expect(await adapter.deleteBeforeTime(day3)).toBe(0);
    await adapter.clear();
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });
});
