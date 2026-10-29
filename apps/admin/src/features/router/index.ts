import { parseQuery, stringifyQuery } from '@fedstack/utils';
import { createRouter } from '@tanstack/react-router';
import { setRouter } from './router-ref';
import { routeTree } from './routeTree.gen';

/**
 * TanStack Router search param 序列化适配层。
 *
 * 编码/解码核心委托给 `@fedstack/utils` 的 parseQuery / stringifyQuery
 * （移植自 vue-router，编码策略成熟：空格 `+`、`+` 转义 `%2B`、`[]{}|^`` 保持字面量）。
 *
 * 额外适配：
 *   1. stringifyQuery 只处理基本类型/数组，TanStack 可能传嵌套对象 → 点号 key 展开
 *   2. stringifyQuery 返回值带 `?` 前缀，TanStack 要求不带 → `.slice(1)`
 *   3. parseQuery 返回值是 `string | null | (string | null)[]`，TanStack 期望 `Record<string, unknown>`
 *      → 自动类型转换（数字 / 布尔）+ 点号 key 合并成嵌套对象
 */

/** 把任意 search object 展开成 shared stringifyQuery 能吃的 LocationQueryRaw。 */
function flattenSearch(
  obj: Record<string, unknown>,
  prefix = '',
): Record<string, string | number | null | undefined | (string | number | null | undefined)[]> {
  const result: Record<string, any> = {};

  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;

    if (value === undefined || value === null) {
      result[fullKey] = value;
    }
    else if (Array.isArray(value)) {
      result[fullKey] = value.map(item =>
        item === undefined || item === null ? item : String(item),
      );
    }
    else if (typeof value === 'object') {
      Object.assign(result, flattenSearch(value as Record<string, unknown>, fullKey));
    }
    else {
      result[fullKey] = value; // string | number | boolean
    }
  }

  return result;
}

/** 把 parseQuery 返回的 LocationQuery 做自动类型转换 + 点号 key 合并。 */
function restoreSearch(raw: Record<string, string | null | (string | null)[]>): Record<string, unknown> {
  const converted: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(raw)) {
    if (Array.isArray(value)) {
      converted[key] = value.map(autoConvert);
    }
    else {
      converted[key] = autoConvert(value);
    }
  }

  return unflattenKeys(converted);
}

/** 点号 key 合并成嵌套对象。 */
function unflattenKeys(record: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(record)) {
    if (!key.includes('.')) {
      result[key] = value;
      continue;
    }

    const parts = key.split('.');
    let cursor: any = result;
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i]!;
      if (!(part in cursor) || typeof cursor[part] !== 'object' || cursor[part] === null) {
        cursor[part] = {};
      }
      cursor = cursor[part];
    }
    cursor[parts[parts.length - 1]!] = value;
  }

  return result;
}

/** 把 string / null 自动转为 number / boolean。 */
function autoConvert(value: string | null): unknown {
  if (value === null || value === '')
    return value;
  if (value === 'true')
    return true;
  if (value === 'false')
    return false;
  if (/^-?\d+(?:\.\d+)?$/.test(value)) {
    const num = Number(value);
    if (!Number.isNaN(num))
      return num;
  }
  return value;
}

/** TanStack Router 的 stringifySearch 签名适配。 */
function stringifySearch(search: Record<string, unknown>): string {
  // 必须带 `?` 前缀：TanStack 的 stringifySearch 契约是返回 `?a=1` 整串
  // （router-core 的 stringifySearchWith 返回 `searchStr ? `?${searchStr}` : ''`）。
  // 去掉前缀会让 href 拼成 `/loginredirect=/home` 这种畸形 URL。
  return stringifyQuery(flattenSearch(search));
}

/** TanStack Router 的 parseSearch 签名适配。 */
function parseSearch(search: string): Record<string, unknown> {
  if (!search)
    return {};
  const raw = parseQuery(search);
  return restoreSearch(raw);
}

// ───────────────────────────────────────────────

/**
 * 阶段 1：router 创建。
 * context 暂时空对象——阶段 2 由 RouterProvider 动态注入 auth + queryClient。
 */
export const router = createRouter({
  routeTree,
  context: {},
  // 自定义 query string 序列化：对齐 Skyroc admin 的 URLSearchParams 格式
  // （tags=a&tags=b）而非 TanStack 默认 JSON 格式，后端 NestJS @Query 期望前者
  stringifySearch,
  parseSearch,
  // 子路由未命中时，404 冒泡到根路由的 not-found 处理
  notFoundMode: 'root',
  // 列表页进入详情再返回时，自动恢复滚动位置
  scrollRestoration: true,
  // 鼠标悬停 Link 时提前预加载目标路由，点击时几乎零延迟
  defaultPreload: 'intent',
  // 预加载数据的新鲜度窗口：0ms = 每次预加载只做代码 chunk 加载（autoCodeSplitting），
  // 不缓存 loader 数据，跳转时重新请求。后台数据变动频繁，默认 30 秒缓存会展示过期数据。
  defaultPreloadStaleTime: 0,
  // pending spinner 延迟 10ms 出现（避免快速请求闪烁）
  defaultPendingMs: 10,
  // pending spinner 至少展示 1000ms（避免一闪而过的视觉抖动）
  defaultPendingMinMs: 1000,
  // loader 数据 selector 细粒度订阅的结构共享优化
  // 当 selector 只取大对象的部分字段时，深度比较后只更新变化的引用，最小化重渲染
  defaultStructuralSharing: true,
});

export type RouterConfig = typeof router;

// 注册运行时引用，供 router-ref.ts 的 getRouter() 使用
setRouter(router);

declare module '@tanstack/react-router' {
  interface Register {
    router: RouterConfig;
  }

  // 扩展 route.staticData 的 Meta 类型（阶段 3+ 用于 RBAC / 菜单 / 图标等）
  interface StaticDataRouteOption {}
}
