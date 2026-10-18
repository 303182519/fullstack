import process from 'node:process';
import { defineConfig } from 'prisma/config';

/**
 * Prisma CLI 配置（Prisma 7）。
 *
 * 说明：
 * - Prisma 7 起数据源 url 只在此处声明，schema.prisma 的 datasource 块仅保留 provider。
 * - 文件名为 prisma.config.ts：当前锁定的 CLI 为 7.9.1，尚未支持 7.10 起引入的 prisma7.config.ts，
 *   7.10+ 的 CLI 两种名称都能识别，因此该命名在后续升级时保持兼容。
 * - 迁移/执行类命令所需的 DATABASE_URL 由调用方显式提供（本地 shell 导出或 CI 注入），
 *   本文件不加载 .env，避免在 `pnpm install --prod` 等场景下因缺失依赖而导致配置加载失败。
 * - `prisma generate` 不需要连接数据库：url 缺失时留空即可，不影响生成产物。
 */
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
