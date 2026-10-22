import type { MessageSendPayload, MessageSendResult } from '@/modules/message/message-send.handler.js';
import type { IJobContext } from '@/shared/jobs/types/job.types.js';
import { MessageTemplateChannel } from '@fedstack/database';
import { Logger } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MessageSendHandler } from '@/modules/message/message-send.handler.js';

function makeCtx(payload: MessageSendPayload): IJobContext<MessageSendPayload> {
  return {
    jobId: '1234567890123456789',
    bullJobId: 'job-abc',
    name: 'message-send',
    payload,
    attemptsMade: 1,
    maxAttempts: 3,
    updateProgress: vi.fn(async () => {}),
  };
}

describe('messageSendHandler', () => {
  let ctx: IJobContext<MessageSendPayload>;
  let messageCenter: {
    sendDirect: ReturnType<typeof vi.fn>;
  };
  let registry: {
    register: ReturnType<typeof vi.fn>;
  };
  let handler: MessageSendHandler;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});

    messageCenter = {
      sendDirect: vi.fn(async () => {}),
    };
    registry = {
      register: vi.fn(),
    };

    handler = new MessageSendHandler(
      messageCenter as any,
      registry as any,
    );

    ctx = makeCtx({
      channel: MessageTemplateChannel.INNER,
      payload: {
        tenantId: 10n,
        recipientId: 'user-1',
        title: '测试',
        content: '测试内容',
        category: 'SECURITY',
      },
    });
  });

  describe('构造注册', () => {
    it('constructor 自动 registry.register(this)', () => {
      expect(registry.register).toHaveBeenCalledWith(handler);
      expect(handler.name).toBe('message-send');
    });
  });

  describe('handle 成功路径', () => {
    it('updateProgress(10) → sendDirect → updateProgress(100) → 返回 MessageSendResult', async () => {
      // handler 传的 payload 是 MessageSendPayload（含 channel + inner payload）
      await handler.handle(ctx);

      // 进度打点：10 在 sendDirect 之前
      expect(ctx.updateProgress).toHaveBeenNthCalledWith(1, 10);

      // sendDirect 被正确调用
      expect(messageCenter.sendDirect).toHaveBeenCalledWith(
        MessageTemplateChannel.INNER,
        expect.objectContaining({ recipientId: 'user-1' }),
      );

      // 进度打点：100 在 sendDirect 之后
      expect(ctx.updateProgress).toHaveBeenNthCalledWith(2, 100);
    });

    it('返回 MessageSendResult shape: { channel, recipientId, tenantId, sentAt }', async () => {
      const result: MessageSendResult = await handler.handle(ctx);

      expect(result).toMatchObject({
        channel: MessageTemplateChannel.INNER,
        recipientId: 'user-1',
        tenantId: '10', // bigint → toString
      });
      // sentAt 是 ISO 时间串
      expect(result.sentAt).toBeTruthy();
      expect(() => new Date(result.sentAt!)).not.toThrow();
    });
  });

  describe('handle 失败路径', () => {
    it('sendDirect throw → handler 不吞，异常传播（让 JobProcessor 走重试）', async () => {
      const boom = new Error('SMTP timeout');
      messageCenter.sendDirect.mockRejectedValue(boom);

      await expect(handler.handle(ctx)).rejects.toThrow('SMTP timeout');

      // updateProgress(10) 已经执行，但 100 不会执行
      expect(ctx.updateProgress).toHaveBeenCalledWith(10);
      expect(ctx.updateProgress).not.toHaveBeenCalledWith(100);
    });
  });
});
