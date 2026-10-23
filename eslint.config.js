import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { builtinModules } from 'node:module';
import { join } from 'node:path';
import { base } from '@fedstack/eslint-config';

// ── packages 四层边界（ADR-015）────────────────────────────────────────────
// shared  ：零环境依赖，前后端皆可 import（如 auth-core）
// node    ：Node/NestJS 专用（如 database/redis/health），进入浏览器产物即构建爆炸
// web     ：浏览器专用（预留，前端双 app 共享 UI/hooks/api-client 落此层）
// tooling ：构建与 lint 工具链（eslint-config），不进运行时
// 全局方向：app → package，任何 package 禁止依赖 apps/*。
//
// 各层包名清单从目录结构自动派生：新增包即刻纳入边界，无需手工维护名单。
// 拦截双通道（均为 core no-restricted-imports）：
//   ① 包名：workspace 内跨包引用的正规途径（如 '@fedstack/redis'）；
//   ② 相对路径说明符：拦截深相对引用（如 '../../node/database/src/index.js'）。
//      模式按说明符字面量匹配，包内出现与层同名的目录（node/web/apps 等）会误判，
//      属可接受的防护面（已实测验证，见 ADR-015）。
// 说明：antfu 9.x 集成的 eslint-plugin-import-lite 无 no-restricted-paths 规则，
// 故不采用 zone 方案；漏网者最终由 bundler/tsc 对 Node builtins 的解析错误兜底。

function packageNamesOf(dir) {
  const abs = join(import.meta.dirname, dir);
  if (!existsSync(abs))
    return [];
  return readdirSync(abs, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map((entry) => {
      try {
        return JSON.parse(readFileSync(join(abs, entry.name, 'package.json'), 'utf8')).name;
      }
      catch {
        return null;
      }
    })
    .filter(name => typeof name === 'string');
}

const nodeLayer = packageNamesOf('packages/node');
const webLayer = packageNamesOf('packages/web');
const toolingLayer = packageNamesOf('packages/tooling');
const appPackages = packageNamesOf('apps');

const nodeBuiltinNames = [...new Set(
  builtinModules.flatMap(name => (name.startsWith('node:') ? [name] : [name, `node:${name}`])),
)];

const APP_DIRECTION_MESSAGE = 'package 禁止依赖 app（依赖方向：app → package，ADR-015）';

function group(names, message) {
  return names.length > 0 ? [{ group: names, message }] : [];
}

export default base({
  ignores: ['apps/**', 'packages/node/redis/**', 'packages/node/health/**', 'scripts/**'],
})
  .append(
    {
      name: 'fedstack/boundary-shared',
      files: ['packages/shared/**/*.ts'],
      rules: {
        'no-restricted-imports': ['error', {
          paths: nodeBuiltinNames.map(name => ({
            name,
            message: 'shared 层必须保持浏览器可运行，禁止 Node.js 内置模块（ADR-015）',
          })),
          patterns: [
            ...group(nodeLayer, 'shared 层禁止依赖 node 层包（ADR-015）'),
            ...group(webLayer, 'shared 层禁止依赖 web 层包（ADR-015）'),
            ...group(toolingLayer, 'shared 层禁止依赖 tooling 层包（ADR-015）'),
            ...group(appPackages, APP_DIRECTION_MESSAGE),
            { group: ['../**/node/**'], message: 'shared 层禁止相对路径引用 node 层（ADR-015）' },
            { group: ['../**/web/**'], message: 'shared 层禁止相对路径引用 web 层（ADR-015）' },
            { group: ['../**/tooling/**'], message: 'shared 层禁止相对路径引用 tooling 层（ADR-015）' },
            { group: ['../**/apps/**'], message: APP_DIRECTION_MESSAGE },
          ],
        }],
      },
    },
    {
      name: 'fedstack/boundary-web',
      files: ['packages/web/**/*.ts', 'packages/web/**/*.tsx'],
      rules: {
        'no-restricted-imports': ['error', {
          patterns: [
            ...group(nodeLayer, 'web 层禁止依赖 node 层包（ADR-015）'),
            ...group(appPackages, APP_DIRECTION_MESSAGE),
            { group: ['../**/node/**'], message: 'web 层禁止相对路径引用 node 层（ADR-015）' },
            { group: ['../**/apps/**'], message: APP_DIRECTION_MESSAGE },
          ],
        }],
      },
    },
    {
      name: 'fedstack/boundary-node',
      files: ['packages/node/**/*.ts'],
      rules: {
        'no-restricted-imports': ['error', {
          patterns: [
            ...group(webLayer, 'node 层禁止依赖 web 层包（ADR-015）'),
            ...group(appPackages, APP_DIRECTION_MESSAGE),
            { group: ['../**/web/**'], message: 'node 层禁止相对路径引用 web 层（ADR-015）' },
            { group: ['../**/apps/**'], message: APP_DIRECTION_MESSAGE },
          ],
        }],
      },
    },
    {
      name: 'fedstack/boundary-tooling',
      files: ['packages/tooling/**/*.ts', 'packages/tooling/**/*.js'],
      rules: {
        'no-restricted-imports': ['error', {
          patterns: [
            ...group(appPackages, APP_DIRECTION_MESSAGE),
            { group: ['../**/apps/**'], message: APP_DIRECTION_MESSAGE },
          ],
        }],
      },
    },
    {
      // eslint-plugin-unused-imports 与 ESLint 10 在 JS 文件上存在兼容性误报：
      // 所有 const 绑定被误判为 "only used as a type"（最小探针已复现，TS 文件免疫）。
      // 此处关闭该插件规则；核心 no-unused-vars 在 JS 文件上工作正常，防护不缺失。
      name: 'fedstack/js-unused-vars-workaround',
      files: ['*.config.js', 'packages/tooling/**/*.js'],
      rules: {
        'unused-imports/no-unused-vars': 'off',
      },
    },
  );
