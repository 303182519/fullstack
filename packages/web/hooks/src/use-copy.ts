import { useState } from 'react';

export interface UseCopyReturn {
  /** 是否已复制 */
  copied: boolean;
  /** 已复制的文本内容 */
  copiedText: string;
  /** 复制文本到剪贴板 */
  copy: (text: string) => Promise<boolean>;
}

/** Hook for copying text to clipboard */
export function useCopy(): UseCopyReturn {
  const [copied, setCopied] = useState(false);
  const [copiedText, setCopiedText] = useState('');

  async function copy(text: string): Promise<boolean> {
    if (!text)
      return false;

    try {
      if (navigator.clipboard && window.isSecureContext)
        await navigator.clipboard.writeText(text);
      else
        await legacyCopy(text);

      setCopied(true);
      setCopiedText(text);
      return true;
    }
    catch {
      setCopied(false);
      setCopiedText('');
      return false;
    }
  }

  return {
    copied,
    copiedText,
    copy,
  };
}

/** 非安全上下文（http / 旧浏览器）下的兜底复制：隐藏 textarea + execCommand */
async function legacyCopy(text: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.left = '-999999px';
    textArea.style.top = '-999999px';
    textArea.style.opacity = '0';
    textArea.style.pointerEvents = 'none';
    textArea.tabIndex = -1;
    textArea.setAttribute('readonly', '');
    document.body.appendChild(textArea);

    try {
      textArea.select();
      textArea.setSelectionRange(0, textArea.value.length);
      const successful = document.execCommand('copy');
      if (successful)
        resolve();
      else
        reject(new Error('execCommand copy failed'));
    }
    catch (error) {
      reject(error);
    }
    finally {
      document.body.removeChild(textArea);
    }
  });
}
