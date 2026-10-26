import { defineConfig } from '@rsbuild/core';
import { pluginReact } from '@rsbuild/plugin-react';
import { pluginTailwindcss } from '@rsbuild/plugin-tailwindcss';

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
  plugins: [
    pluginReact({
      reactCompiler: true,
    }),
    pluginTailwindcss(),
  ],
});
