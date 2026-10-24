import type { LogLayerTransportParams } from '@loglayer/transport';
import type { LogLevel } from 'loglayer';
import type { IStorageAdapter, LogRecord } from '../types';
import { LoggerlessTransport } from '@loglayer/transport';
import { nanoid } from 'nanoid';

import { serializeError } from 'serialize-error';
import { BUFFER_MAX_MULTIPLIER, DEFAULT_BUFFER_SIZE, DEFAULT_FLUSH_INTERVAL } from '../constants';

interface StorageTransportConfig {
  /** 存储适配器 */
  adapter: IStorageAdapter;
  /** 缓冲区大小，达到后自动刷新 */
  bufferSize?: number;
  /** 刷新间隔（毫秒） */
  flushInterval?: number;
}

/** 本地存储传输器 将日志缓冲后批量写入本地存储 */
export class StorageTransport extends LoggerlessTransport {
  /** 存储适配器 */
  private adapter: IStorageAdapter;

  /** 日志缓冲区 */
  private buffer: LogRecord[] = [];

  /** 缓冲区大小 */
  private bufferSize: number;

  /** 缓冲区硬上限（bufferSize × BUFFER_MAX_MULTIPLIER），超限丢弃最旧日志 */
  private maxBufferSize: number;

  /** 是否已告警过缓冲区溢出（恢复后重置，避免刷屏） */
  private hasWarnedOverflow = false;

  /** 刷新计时器 */
  private flushTimer: ReturnType<typeof setInterval> | null = null;

  /** 刷新间隔 */
  private flushInterval: number;

  /** 是否正在刷新 */
  private isFlushing = false;

  constructor(config: StorageTransportConfig) {
    super({ id: 'storage' });
    this.adapter = config.adapter;
    this.bufferSize = config.bufferSize ?? DEFAULT_BUFFER_SIZE;
    this.maxBufferSize = this.bufferSize * BUFFER_MAX_MULTIPLIER;
    this.flushInterval = config.flushInterval ?? DEFAULT_FLUSH_INTERVAL;

    // 启动定时刷新
    this.startFlushTimer();
  }

  /** 接收日志消息（返回类型 any[] 与 LoggerlessTransport 基类抽象签名一致） */
  shipToLogger(params: LogLayerTransportParams): any[] {
    const { logLevel, messages, metadata, context, error } = params;

    const record = this.createLogRecord(logLevel as LogLevel, messages, { metadata, context, error });

    this.buffer.push(record);
    this.trimBufferOverflow();

    // 检查是否需要刷新
    if (this.buffer.length >= this.bufferSize) {
      void this.flush();
    }

    return messages;
  }

  /**
   * 创建日志记录
   *
   * 不解析合并后的 data：未配置 contextFieldName / metadataFieldName 时 context 与
   * metadata 平铺在 data 根上无法区分来源，error 的 key 又由 errorFieldName 配置决定。
   * 统一使用 params 顶层独立的 context / metadata / error，与 schema 配置无关。
   */
  private createLogRecord(
    level: LogLevel,
    messages: unknown[],
    parts: { metadata?: Record<string, any> | null; context?: Record<string, any> | null; error?: unknown },
  ): LogRecord {
    const message = messages
      .map((m) => {
        if (typeof m === 'string')
          return m;
        if (m instanceof Error)
          return m.message;
        return JSON.stringify(m);
      })
      .join(' ');

    const { metadata, context, error } = parts;

    let errorField: Record<string, any> | undefined;
    if (error instanceof Error) {
      errorField = serializeError(error);
    }
    else if (error !== null && error !== undefined) {
      // withError 运行时接受任意类型，非 Error 值兜底保留
      errorField = typeof error === 'object' ? error as Record<string, any> : { message: String(error) };
    }

    return {
      id: nanoid(),
      timestamp: Date.now(),
      level,
      message,
      data: metadata && Object.keys(metadata).length > 0 ? metadata : undefined,
      context: context && Object.keys(context).length > 0 ? context : undefined,
      error: errorField,
    };
  }

  /**
   * 缓冲区溢出裁剪：超出硬上限时丢弃最旧日志。
   *
   * 仅在首次溢出时 console.warn 一次，成功 flush（缓冲区排空）后重置告警标记，
   * 避免持续溢出场景下告警刷屏。
   */
  private trimBufferOverflow(): void {
    if (this.buffer.length <= this.maxBufferSize) {
      return;
    }

    const droppedCount = this.buffer.length - this.maxBufferSize;
    this.buffer.splice(0, droppedCount);

    if (!this.hasWarnedOverflow) {
      this.hasWarnedOverflow = true;
      console.warn(`[StorageTransport] Buffer overflow (max ${this.maxBufferSize}), dropped ${droppedCount} oldest log(s)`);
    }
  }

  /** 刷新缓冲区到存储 */
  async flush(): Promise<void> {
    if (this.isFlushing || this.buffer.length === 0) {
      return;
    }

    this.isFlushing = true;
    const recordsToFlush = [...this.buffer];
    this.buffer = [];

    try {
      await this.adapter.writeBatch(recordsToFlush);
      // 缓冲区已排空，重置溢出告警标记
      this.hasWarnedOverflow = false;
    }
    catch (error) {
      // 写入失败，将日志放回缓冲区（同样受硬上限约束）
      this.buffer = [...recordsToFlush, ...this.buffer];
      this.trimBufferOverflow();
      console.error('[StorageTransport] Failed to flush logs:', error);
    }
    finally {
      this.isFlushing = false;
    }
  }

  /** 启动刷新计时器 */
  private startFlushTimer(): void {
    if (this.flushTimer) {
      return;
    }
    this.flushTimer = setInterval(() => {
      void this.flush();
    }, this.flushInterval);
  }

  /** 停止刷新计时器 */
  private stopFlushTimer(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
  }

  /** 销毁传输器 */
  async dispose(): Promise<void> {
    this.stopFlushTimer();
    await this.flush();
  }
}
