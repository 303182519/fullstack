import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { defineConfig } from 'prisma/config';

/**
 * Prisma CLI 配置（Prisma 7）。
 *
 * 说明：
 * - Prisma 7 起数据源 url 只在此处声明，schema.prisma 的 datasource 块仅保留 provider。
 * - 文件名为 prisma.config.ts：当前锁定的 CLI 为 7.9.1，尚未支持 7.10 起引入的 prisma7.config.ts，
 *   7.10+ 的 CLI 两种名称都能识别，因此该命名在后续升级时保持兼容。
 * - 本文件零依赖：手动读取同目录 `.env`（fs 是 Node 内置），再回退 process.env。
 *   不引入 dotenv，避免 `pnpm install --prod` 场景下因缺失依赖而导致配置加载失败。
 *   Prisma 7 的 `defineConfig` **不会自动加载** .env，必须手动解析。
 * - `prisma generate` 不需要连接数据库：url 缺失时留空即可，不影响生成产物。
 *
 * 迁移命令两种用法等价：
 *   1. 本地：把 DATABASE_URL 写入本目录 `.env`，直接 `pnpm db:migrate:dev --name <name>`
 *   2. CI：`DATABASE_URL=xxx pnpm db:migrate:dev --name <name>`
 */

/**
 * 从同目录 `.env` 手动解析环境变量。零依赖：只用 Node 内置 fs。
 *
 * Prisma 7 的 `defineConfig` 不会自动加载 .env（只有 schema.prisma 里用 env() 才会），
 * 所以必须在 config 层自己读。不引入 dotenv 包的纪律：保持 CLI 场景零额外依赖。
 */
function loadEnvFile(): Record<string, string> {
  const envPath = path.resolve(__dirname, '.env');
  if (!fs.existsSync(envPath))
    return {};

  const result: Record<string, string> = {};
  const raw = fs.readFileSync(envPath, 'utf-8');
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#'))
      continue;
    const idx = trimmed.indexOf('=');
    if (idx <= 0)
      continue;
    const key = trimmed.slice(0, idx).trim();
    let value = trimmed.slice(idx + 1).trim();
    // 去掉首尾引号
    if ((value.startsWith('"') && value.endsWith('"'))
      || (value.startsWith('\'') && value.endsWith('\''))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key])
      process.env[key] = value;
    result[key] = value;
  }
  return result;
}

loadEnvFile();

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    // `prisma db seed` 执行的命令。seed 编译进 dist（pnpm build 产物），先构建再播种；
    // DATABASE_URL 由调用方环境提供（与迁移一致）。
    seed: 'node dist/src/seed.js',
  },
  datasource: {
    url: process.env.DATABASE_URL ?? '',
  },
});
