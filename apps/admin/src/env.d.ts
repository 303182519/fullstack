/// <reference types="@rsbuild/core/types" />

/**
 * 本次构建的时间戳（ISO 8601），由 rsbuild 的 `source.define` 在构建期注入。
 */
declare const BUILD_TIME: string;

/**
 * 客户端环境变量（仅 `PUBLIC_` 前缀会被 Rsbuild 暴露）。
 * 取值见 apps/admin/.env / .env.dev / .env.prod。
 */
interface ImportMetaEnv {
  /** admin-api 基础地址（含全局前缀 /api） */
  readonly PUBLIC_API_BASE_URL: string;
  /** 当前运行环境标识 */
  readonly PUBLIC_ENV: string;
  readonly PUBLIC_MY_APP_NAME: string;
  /** 业务码：access token 过期（触发静默续签），逗号分隔 */
  readonly PUBLIC_SERVICE_EXPIRED_TOKEN: string;
  /** 业务码：需要登出，逗号分隔 */
  readonly PUBLIC_SERVICE_LOGOUT: string;
  /** 业务码：请求成功 */
  readonly PUBLIC_SERVICE_SUCCESS_CODE: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/**
 * Imports the SVG file as a React component.
 * @requires [@rsbuild/plugin-svgr](https://npmjs.com/package/@rsbuild/plugin-svgr)
 */
declare module '*.svg?react' {
  import type { FunctionComponent, SVGProps } from 'react';

  const ReactComponent: FunctionComponent<SVGProps<SVGSVGElement>>;
  export default ReactComponent;
}
