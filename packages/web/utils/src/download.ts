import { openWindow } from './window';

interface DownloadOptions<T = string> {
  fileName?: string;
  source: T;
  target?: string;
}

const DEFAULT_FILENAME = 'downloaded_file';

/**
 * 通过 URL 下载文件（尽量支持跨域：若 CORS 允许则 fetch->blob 下载；否则回退 openWindow）
 *
 * @throws {Error} - 当 source 非法、或 fetch blob 失败且无法回退时抛出错误（通常不会）
 */
export async function downloadFileFromUrl({ fileName, source, target = '_blank' }: DownloadOptions): Promise<void> {
  if (!source || typeof source !== 'string') {
    throw new Error('Invalid URL.');
  }
  if (typeof window === 'undefined')
    return;

  const url = normalizeUrl(source);

  // iOS / iPadOS 上 a[download] 行为经常不可靠（尤其跨域）
  // 这里直接走打开新窗口，更符合“可用优先”（用户可预览/分享/保存）
  if (isIOS()) {
    openWindow(url, { target });
    return;
  }

  // 优先尝试 fetch -> blob（CORS 允许时最稳定，可自定义文件名）
  try {
    const res = await fetch(url, { mode: 'cors' });

    // 某些场景 res.type === 'opaque'（no-cors），读不到内容；直接回退 openWindow
    if (!res.ok || res.type === 'opaque') {
      openWindow(url, { target });
      return;
    }

    const blob = await res.blob();

    // 解析文件名：优先 header，其次参数 fileName，其次 url path
    const headerName = getFileNameFromHeaders(res.headers);
    const finalName = headerName || fileName || resolveFileName(url);

    downloadFileFromBlob({ fileName: finalName, source: blob });
  }
  catch {
    // fetch 失败（可能 CORS 禁止 / 网络问题 / 被拦截） -> 回退打开
    openWindow(url, { target });
  }
}

/** 通过 Base64 / DataURL 下载文件 支持： - data:application/pdf;base64,... - data:image/png;base64,... */
export function downloadFileFromBase64({ fileName, source }: DownloadOptions): void {
  if (!source || typeof source !== 'string') {
    throw new Error('Invalid Base64 data.');
  }
  if (typeof window === 'undefined')
    return;

  const resolvedFileName = fileName || DEFAULT_FILENAME;
  triggerDownload(source, resolvedFileName);
}

/** 通过图片 URL 下载图片文件（canvas 转 base64） */
export async function downloadFileFromImageUrl({ fileName, source }: DownloadOptions): Promise<void> {
  if (!source || typeof source !== 'string') {
    throw new Error('Invalid image URL.');
  }
  const base64 = await urlToBase64(source);
  downloadFileFromBase64({ fileName: fileName || resolveFileName(source), source: base64 });
}

/** 通过 Blob 下载文件 */
export function downloadFileFromBlob({ fileName = DEFAULT_FILENAME, source }: DownloadOptions<Blob>): void {
  if (typeof window === 'undefined')
    return;

  if (!(source instanceof Blob)) {
    throw new TypeError('Invalid Blob data.');
  }

  const url = URL.createObjectURL(source);
  triggerDownload(url, fileName);
}

/** 下载文件：支持 BlobPart（string / ArrayBuffer / Uint8Array 等） */
export function downloadFileFromBlobPart({ fileName = DEFAULT_FILENAME, source }: DownloadOptions<BlobPart>): void {
  if (typeof window === 'undefined')
    return;

  const blob = source instanceof Blob ? source : new Blob([source], { type: 'application/octet-stream' });

  const url = URL.createObjectURL(blob);
  triggerDownload(url, fileName);
}

/** Img url -> base64 注意：跨域图片必须服务端允许 CORS，否则 canvas 会被污染导致 toDataURL 抛错 */
export function urlToBase64(url: string, mineType?: string): Promise<string> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Not in browser environment.'));
  }

  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();

    // 更明确：匿名跨域（前提是图片响应带 Access-Control-Allow-Origin）
    img.crossOrigin = 'anonymous';

    function cleanup(): void {
      img.removeEventListener('load', handleLoad);
      img.removeEventListener('error', handleError);
    }

    function handleLoad(): void {
      if (!ctx) {
        cleanup();
        reject(new Error('Failed to get canvas context.'));
        return;
      }

      try {
        canvas.width = img.naturalWidth || img.width;
        canvas.height = img.naturalHeight || img.height;

        ctx.drawImage(img, 0, 0);

        const dataURL = canvas.toDataURL(mineType || 'image/png');
        cleanup();
        resolve(dataURL);
      }
      catch {
        cleanup();
        reject(new Error('Failed to convert image to base64.'));
      }
    }

    function handleError(): void {
      cleanup();
      reject(new Error('Failed to load image (CORS or network error).'));
    }

    img.addEventListener('load', handleLoad);
    img.addEventListener('error', handleError);

    img.src = normalizeUrl(url);
  });
}

/**
 * 通用下载触发函数
 *
 * @param href - 文件下载的 URL / data URL / blob URL
 * @param fileName - 下载文件名
 * @param revokeDelay - 清理 blob URL 的延迟时间 (毫秒)
 */
export function triggerDownload(href: string, fileName: string | undefined, revokeDelay: number = 150): void {
  if (typeof window === 'undefined')
    return;

  const finalFileName = fileName || DEFAULT_FILENAME;

  const link = document.createElement('a');
  link.href = href;
  link.style.display = 'none';

  // 安全 & 兼容：即便不是 window.open，也保持一致
  link.rel = 'noopener noreferrer';

  // 尽量设置 download（某些浏览器/跨域会忽略，但无害）
  link.download = finalFileName;

  document.body.appendChild(link);

  // Safari 有时候更吃“真实点击事件”
  try {
    link.click();
  }
  catch {
    link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
  }

  link.remove();

  // 只对 blob: URL revoke（对 http(s)/data revoke 没意义）
  if (href.startsWith('blob:')) {
    window.setTimeout(() => {
      try {
        URL.revokeObjectURL(href);
      }
      catch {
        // ignore
      }
    }, revokeDelay);
  }
}

/** 从 URL 里解析文件名（去掉 query/hash） */
function resolveFileName(url: string, override?: string): string {
  if (override)
    return override;

  try {
    const u = new URL(url, window.location.href);
    const pathname = u.pathname || '';
    const last = pathname.split('/').filter(Boolean).pop();
    return decodeURIComponent(last || DEFAULT_FILENAME);
  }
  catch {
    // 兜底：手动剥离 query/hash
    const cleaned = url.split('#')[0]!.split('?')[0]!;
    const last = cleaned.slice(cleaned.lastIndexOf('/') + 1);
    return last ? safeDecode(last) : DEFAULT_FILENAME;
  }
}

/** 解析 Content-Disposition 里的文件名（如果服务端提供） */
function getFileNameFromHeaders(headers: Headers): string | null {
  const cd = headers.get('content-disposition') || headers.get('Content-Disposition');
  if (!cd)
    return null;

  // filename*=UTF-8''xxx 或 filename="xxx"
  const filenameStar = /filename\*\s*=[^']*''([^;]+)/i.exec(cd);
  if (filenameStar?.[1]) {
    return safeDecode(filenameStar[1]);
  }

  const filename = /filename\s*=\s*"([^"]+)"/i.exec(cd) || /filename\s*=\s*([^;]+)/i.exec(cd);
  if (filename?.[1]) {
    return safeDecode(filename[1].trim());
  }

  return null;
}

function normalizeUrl(url: string): string {
  // 允许传相对路径
  try {
    return new URL(url, window.location.href).toString();
  }
  catch {
    return url;
  }
}

function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s);
  }
  catch {
    return s;
  }
}

function isIOS(): boolean {
  const ua = navigator.userAgent || '';
  // iPhone/iPad/iPod + iPadOS（MacIntel + touch）
  const iOSLike = /iPhone|iPod|iPad/.test(ua);
  const iPadOSLike = navigator.platform === 'MacIntel' && (navigator as any).maxTouchPoints > 1;
  return iOSLike || iPadOSLike;
}
