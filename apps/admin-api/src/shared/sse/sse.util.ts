import type { Response } from 'express';

/**
 * 通用 SSE 事件信封。
 *
 * 所有 per-entity SSE（jobs/:id/events、未来 agent/runs/:id/events）
 * 共用此信封，保证 SSE 帧输出一致：
 *
 *   event: <eventName>
 *   id:    <streamEntryId | 可选，仅需要断线续传时传>
 *   data:  <JSON.stringify(envelope)>
 *
 * Redis Pub/Sub 消息（全局流待废弃）也应复用此信封——
 * Pub/Sub 消息格式与 SSE data 体对齐，消费者拿到后可直接透传 res.write()。
 */
export interface SseEnvelope<TData = unknown> {
  /** SSE event 行值，例：job.snapshot / job.completed / agent.message.delta */
  event: string;
  /**
   * SSE id 行值（Redis Stream entry id，如 1735044000000-0）；
   * 省略时浏览器不更新 Last-Event-ID（适用于快照等无序列号语义的事件）
   */
  id?: string;
  /** 事件体，通常是领域快照或增量 */
  data: TData;
}

/** SSE 帧尾部空行（\n\n 让浏览器 EventSource / 自定义 parser 识别帧边界） */
const SSE_FRAME_TAIL = '\n\n';

/**
 * 把 SseEnvelope 序列化为 SSE 协议帧。
 *
 * 遵循 W3C Server-Sent Events 规范：
 *   - event: <name>
 *   - id:    <id>        ← 仅 envelope.id 有值时输出
 *   - data:  <json>
 *   - （空行）
 *   - （空行）
 *
 * 与 build-server 的 formatSseEvent / formatAgentSseEvent 格式一致。
 *
 * @param envelope SSE 事件信封
 * @returns 可直接 res.write() 的完整 SSE 帧字符串
 */
export function formatSseEvent<TData>(envelope: SseEnvelope<TData>): string {
  const lines: string[] = [`event: ${envelope.event}`];
  if (envelope.id !== undefined) {
    lines.push(`id: ${envelope.id}`);
  }
  lines.push(`data: ${JSON.stringify(envelope.data)}`);
  lines.push('');
  lines.push('');
  return lines.join('\n');
}

/**
 * SSE 心跳：使用注释行 `: heartbeat` 而非 data 行。
 *
 * EventSource / fetch + 自定义 parser 都会跳过以 `:` 开头的注释行——
 * 这样心跳不会污染业务事件通道，客户端不需显式过滤。
 *
 * @param res Express Response（必须已 flushHeaders）
 * @returns 写入是否成功（false 表示连接已不可用，调用方应 teardown）
 */
export function writeSseHeartbeat(res: Response): boolean {
  try {
    if (res.writableEnded || res.destroyed)
      return false;
    return res.write(`: heartbeat${SSE_FRAME_TAIL}`);
  }
  catch {
    return false;
  }
}

/**
 * 校验 Redis Stream entry id 合法性。
 *
 * 格式 `timestamp-sequence`（如 `1735044000000-0`）：
 *   - timestamp：13 位或 10 位数字
 *   - 短横线分隔
 *   - sequence：正整数
 *
 * 非法值（`0-0`、空串、NaN、Redis 通配符 `$`）返回 false。
 * 调用方据此忽略无效 Last-Event-ID 请求头，让客户端从头开始消费。
 */
export function isValidStreamId(id: unknown): id is string {
  if (typeof id !== 'string' || id.length === 0)
    return false;
  if (id === '$')
    return false;
  const m = /^\d+-(\d+)$/.exec(id);
  if (!m)
    return false;
  // timestamp 段必须是正整数（Redis Stream 起始值 >= 0-0 但 0-0 是极早期，允许）
  // sequence 段必须是正整数
  if (Number(m[1]) < 0)
    return false;
  return true;
}

/**
 * 取 Last-Event-ID 请求头中的有效 stream entry id。
 *
 * 客户端断线重连时浏览器/EventSource 会自动带上 Last-Event-ID。
 * fetch 消费场景下客户端需自己记录并手动设置。
 *
 * @param header Express Request 对象或 Request.headers 对象
 */
export function extractLastEventId(
  header: string | string[] | undefined,
): string | undefined {
  if (typeof header === 'string' && isValidStreamId(header))
    return header;
  if (Array.isArray(header)) {
    const first = header.find(isValidStreamId);
    if (first)
      return first;
  }
  return undefined;
}
