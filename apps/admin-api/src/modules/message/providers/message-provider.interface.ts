import type { MessageTemplateChannel } from '@fedstack/database';

/**
 * 消息投递载荷（通道无关）。
 *
 * - `recipientId`：站内信为 userId 字符串；邮件为邮箱地址；短信为手机号。
 * - `subject`：仅邮件使用；站内信与短信忽略。
 * - `category`：来源分类标记，便于前端分组展示。
 * - `sourceType` / `sourceId`：来源对象关联，便于跳转。
 */
export interface MessagePayload {
  readonly tenantId: bigint;
  readonly recipientId: string;
  readonly title: string;
  readonly content: string;
  readonly subject?: string;
  readonly category?: string;
  readonly sourceType?: string;
  readonly sourceId?: string;
}

/**
 * 消息投递结果。
 */
export interface MessageSendResult {
  readonly success: boolean;
  readonly errorMsg?: string;
}

/**
 * 消息通道 Provider 接口（ADR-013 D1）。
 *
 * 每个通道实现一个 Provider；MessageCenter 按 channel 选择对应的 Provider。
 * 加通道 = 加一个 Provider 实现，编排层零改动。
 */
export interface MessageProvider {
  /** 该 Provider 对应的通道 */
  readonly channel: MessageTemplateChannel;

  /**
   * 投递消息。
   *
   * @returns 投递结果；失败时 `success=false` + `errorMsg` 含原因摘要
   */
  send: (payload: MessagePayload) => Promise<MessageSendResult>;
}
