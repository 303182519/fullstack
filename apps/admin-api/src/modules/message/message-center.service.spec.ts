import type { MessagePayload } from '@/modules/message/providers/message-provider.interface.js';
import { MessageSendStatus, MessageTemplateChannel } from '@fedstack/database';
import { Logger } from '@nestjs/common';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { messageErrors } from '@/modules/message/errors.js';
import { MessageCenterService } from '@/modules/message/message-center.service.js';
import { initSnowflake } from '@/shared/utils/snowflake.js';

// generateSnowflakeId 是进程级单例，测试进程不会走应用启动的 initSnowflake，需手动初始化
beforeAll(() => {
  initSnowflake(1n, 1n);
});

function makeProvider(channel: MessageTemplateChannel) {
  return { channel, send: vi.fn() };
}

function makePrisma() {
  // MessageCenterService 内部用 this.prisma.sysMessageSendLog.create(...)
  return { sysMessageSendLog: { create: vi.fn(async () => ({})) } };
}

function makeTemplateService() {
  return {
    effectiveTemplate: vi.fn(async () => ({
      templateKey: 'welcome',
      subject: '欢迎',
      content: '欢迎使用',
    })),
  };
}

function samplePayload(overrides: Partial<MessagePayload> = {}): MessagePayload {
  return {
    tenantId: 10n,
    recipientId: 'user-1',
    title: '测试',
    content: '测试内容',
    category: 'SECURITY',
    ...overrides,
  };
}

describe('messageCenterService', () => {
  let service: MessageCenterService;
  let prisma: ReturnType<typeof makePrisma>;
  let templateService: ReturnType<typeof makeTemplateService>;
  let inner: ReturnType<typeof makeProvider>;
  let email: ReturnType<typeof makeProvider>;
  let sms: ReturnType<typeof makeProvider>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => {});

    prisma = makePrisma();
    templateService = makeTemplateService();
    inner = makeProvider(MessageTemplateChannel.INNER);
    email = makeProvider(MessageTemplateChannel.EMAIL);
    sms = makeProvider(MessageTemplateChannel.SMS);

    // constructor 参数类型为具体 Provider 子类 / PrismaService，用 as any 绕过（与 auth.service.spec.ts 对齐）
    service = new MessageCenterService(
      prisma as any,
      templateService as any,
      inner as any,
      email as any,
      sms as any,
    );
  });

  describe('sendDirect', () => {
    it('provider success → writeLog(SUCCESS) → void', async () => {
      inner.send.mockResolvedValue({ success: true });
      const payload = samplePayload();

      await expect(service.sendDirect(MessageTemplateChannel.INNER, payload)).resolves.toBeUndefined();

      expect(inner.send).toHaveBeenCalledWith(payload);
      expect(prisma.sysMessageSendLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            channel: MessageTemplateChannel.INNER,
            recipient: 'user-1',
            status: MessageSendStatus.SUCCESS,
            errorMsg: null,
          }),
        }),
      );
    });

    it('provider failure → writeLog(FAILURE) → throw sendFailed', async () => {
      inner.send.mockResolvedValue({ success: false, errorMsg: 'SMTP timeout' });
      const payload = samplePayload();

      await expect(service.sendDirect(MessageTemplateChannel.INNER, payload)).rejects.toThrow(
        messageErrors.sendFailed(MessageTemplateChannel.INNER, 'SMTP timeout'),
      );

      // 关键：throw 之前必须已经写了 FAILURE 流水——重试时每次尝试都有记录
      expect(prisma.sysMessageSendLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: MessageSendStatus.FAILURE,
            errorMsg: 'SMTP timeout',
            sentAt: null,
          }),
        }),
      );
    });
  });

  describe('sendTemplate', () => {
    it('provider success → writeLog(SUCCESS) → void', async () => {
      email.send.mockResolvedValue({ success: true });

      await expect(
        service.sendTemplate('welcome', MessageTemplateChannel.EMAIL, {
          tenantId: 10n,
          recipientId: 'user-1',
          category: 'NOTICE',
        }),
      ).resolves.toBeUndefined();

      expect(email.send).toHaveBeenCalled();
      expect(prisma.sysMessageSendLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            templateKey: 'welcome',
            channel: MessageTemplateChannel.EMAIL,
            status: MessageSendStatus.SUCCESS,
          }),
        }),
      );
    });

    it('provider failure → writeLog(FAILURE) → throw sendFailed', async () => {
      email.send.mockResolvedValue({ success: false, errorMsg: '503 gateway' });

      await expect(
        service.sendTemplate('welcome', MessageTemplateChannel.EMAIL, {
          tenantId: 10n,
          recipientId: 'user-1',
          category: 'NOTICE',
        }),
      ).rejects.toThrow(
        messageErrors.sendFailed(MessageTemplateChannel.EMAIL, '503 gateway'),
      );

      // writeLog(FAILURE) 在 throw 之前完成
      expect(prisma.sysMessageSendLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: MessageSendStatus.FAILURE,
            errorMsg: '503 gateway',
          }),
        }),
      );
    });
  });
});
