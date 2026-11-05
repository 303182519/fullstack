import { addAPIProvider } from '@iconify/react';

export interface SetupIconifyOfflineOptions {
  /** 宿主应用使用的 Iconify API 地址 */
  apiUrl?: string;

  /** Iconify provider 名称，空字符串表示配置默认 provider */
  provider?: string;
}

export function setupIconifyOffline(options: SetupIconifyOfflineOptions = {}) {
  const { apiUrl, provider = '' } = options;

  if (apiUrl) {
    addAPIProvider(provider, { resources: [apiUrl] });
  }
}
