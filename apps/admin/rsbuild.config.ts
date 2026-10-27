import { defineConfig } from '@rsbuild/core';
import { pluginReact } from '@rsbuild/plugin-react';

// 页面名称数组
const pages = [
  { name: 'index', title: '首页', template: './static/index.html' },
  // { name: 'about', title: '关于' },
];

const mode = import.meta.env.PUBLIC_ENV;
console.log('PUBLIC_ENV', mode);

// 预处理页面配置映射
const pageConfig = pages.reduce((acc, page) => {
  acc.entries[page.name] = `./src/pages/${page.name}/main.tsx`;
  acc.templates[page.name] = page.template;
  acc.titles[page.name] = page.title;
  return acc;
}, { entries: {} as Record<string, string>, templates: {} as Record<string, string>, titles: {} as Record<string, string> });

// Docs: https://rsbuild.rs/config/
export default defineConfig({
  server: {
    port: 3004,
  },
  source: {
    entry: pageConfig.entries,
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
});
