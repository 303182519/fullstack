import { defineConfig } from '@rsbuild/core';
import { pluginReact } from '@rsbuild/plugin-react';
import { TanStackRouterRspack } from '@tanstack/router-plugin/rspack';

// 页面名称数组
const pages = [
  { name: 'index', title: '首页', template: './static/index.html' },
  // { name: 'about', title: '关于' },
];

const mode = import.meta.env.PUBLIC_ENV;
console.log('PUBLIC_ENV', mode);

// 预处理页面配置映射
const pageConfig = pages.reduce((acc, page) => {
  acc.entries[page.name] = './src/main.tsx';
  acc.templates[page.name] = page.template;
  acc.titles[page.name] = page.title;
  return acc;
}, { entries: {} as Record<string, string>, templates: {} as Record<string, string>, titles: {} as Record<string, string> });

// Docs: https://rsbuild.rs/config/
export default defineConfig({
  server: {
    // admin-api dev CORS 白名单已放行 3003 / 3004（见 apps/admin-api/src/main.ts）。
    // 3003 常被其它本地服务占用，admin 固定用 3004。
    // refresh token 走 HttpOnly Cookie + withCredentials，origin 必须是白名单内的精确值。
    port: 3004,
  },
  source: {
    entry: pageConfig.entries,
    // 构建期注入的构建时间戳，供运行时识别当前构建版本（如主题缓存的版本覆盖检测）
    define: {
      BUILD_TIME: JSON.stringify(new Date().toISOString()),
    },
    // 在正则表达式的例子中，我们使用 [\\/] 来匹配路径分隔符，这是
    // 因为不同的操作系统使用了不同的路径分隔符，使用 [\\/] 可以保证 macOS、Linux 和 Windows 的路径都被匹配到。
    include: [
      /node_modules[\\/]@tanstack[\\/]/,
    ],
  },
  html: {
    template({ entryName }) {
      return pageConfig.templates[entryName] || './static/index.html';
    },
    title({ entryName }) {
      return pageConfig.titles[entryName] || '首页';
    },
  },
  output: {
    minify: true,
    polyfill: 'usage',
    sourceMap: {
      js: 'source-map', // build平台会删除的*.map文件的
      css: false,
    },
    legalComments: 'linked',
  },
  plugins: [
    pluginReact({
      reactCompiler: true,
    }),
  ],
  tools: {
    rspack: {
      plugins: [
        TanStackRouterRspack({
          autoCodeSplitting: true,
          target: 'react',
          routesDirectory: './src/pages',
          generatedRouteTree: './src/features/router/routeTree.gen.ts',
          // routeToken：布局路由的文件标识符（默认是 'route'）。
          // 目录下名为 `layout.tsx` 的文件会被识别为该目录的布局路由，
          // 同级子路由嵌套渲染进该布局。当前生效的：
          //   pages/(admin)/layout.tsx → adminLayoutRoute（包裹 home 等子路由）
          //   pages/(auth)/layout.tsx  → authLayoutRoute（包裹 login 等子路由）
          routeToken: 'layout',
          // routeFileIgnorePattern：命中该正则的文件不参与路由生成。
          // 当前规则忽略两类：
          //   1. 任意层级 components/ 与 modules/ 目录下的所有文件（业务组件，非页面路由）
          //   2. 名为 loading / error / not-found 的 ts(x) 文件
          //      （路由内引用的状态组件，如 pages/loading.tsx，不作为独立路由注册）
          routeFileIgnorePattern:
            '(?:^|/)(components|modules)(?:/|$)|(?:^|/)(loading|error|not-found)(?:.tsx?|$)',
        }),
      ],
    },
  },
});
