import type { PrismaClient } from '../generated/prisma/client.js';
import { URL } from 'node:url';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';

/**
 * 数据库连接参数。
 *
 * 由使用方（各服务）从自身环境注入；本包不读取任何环境变量，避免把某个服务的
 * 环境约定固化进共享层。
 */
export interface DatabaseConnectionOptions {
  /** MySQL 连接串，形如 mysql://user:password@host:3306/database */
  url: string;
  /**
   * 连接池上限。
   *
   * 注意：每个服务进程各自持有一个 PrismaClient，也就是各自一个连接池。
   * 两个池的上限之和必须明显小于 MySQL 的 max_connections（需预留运维与管理连接余量）。
   * Prisma 6 时代的 connection_limit URL 参数对 Prisma 7 的 driver adapter 无效，必须在此显式设置。
   */
  connectionLimit?: number;
}

/** PrismaClient 的构造参数类型（含 driver adapter） */
export type PrismaClientOptions = ConstructorParameters<typeof PrismaClient>[0];

const MYSQL_DEFAULT_PORT = 3306;

/** 连接串格式的统一提示，避免在多处重复文案 */
const URL_FORMAT_HINT = '期望格式：mysql://USER:PASSWORD@HOST:PORT/DATABASE';

interface MysqlConnectionParts {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
}

/**
 * 将连接串拆解为 mariadb 驱动所需的离散连接参数。
 *
 * 为什么必须拆解：Prisma 7 的 driver adapter 只有接收 PoolConfig 对象时才能设置连接池上限；
 * 直接传连接串会退回驱动默认值（connectionLimit 默认 10），无法按服务分配连接池。
 *
 * 连接串上的查询参数不会被该路径采用。为避免运行时连接配置与 Prisma CLI 迁移所用的连接不一致，
 * 这里选择直接报错而不是静默忽略。
 */
function parseConnectionUrl(raw: string): MysqlConnectionParts {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  }
  catch {
    throw new Error(`DATABASE_URL 不是合法的连接串，${URL_FORMAT_HINT}`);
  }

  if (parsed.protocol !== 'mysql:') {
    throw new Error(`DATABASE_URL 的协议必须是 mysql://，当前为 ${parsed.protocol}//`);
  }

  if (parsed.search) {
    throw new Error('DATABASE_URL 暂不支持连接串查询参数：Prisma 7 的 driver adapter 不会采用它们，请改用代码显式配置');
  }

  const database = decodeURIComponent(parsed.pathname.replace(/^\//, ''));
  if (!database) {
    throw new Error(`DATABASE_URL 缺少数据库名，${URL_FORMAT_HINT}`);
  }

  return {
    host: parsed.hostname,
    port: parsed.port ? Number(parsed.port) : MYSQL_DEFAULT_PORT,
    user: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
    database,
  };
}

/**
 * 构造 PrismaClient 的初始化参数。
 *
 * 服务端自建 PrismaService 时可直接透传给 `super()`：
 *
 * ```ts
 * class PrismaService extends PrismaClient {
 *   constructor(config: ConfigService) {
 *     super(createPrismaClientOptions({ url: config.getOrThrow('DATABASE_URL') }));
 *   }
 * }
 * ```
 */
export function createPrismaClientOptions(
  options: DatabaseConnectionOptions,
): PrismaClientOptions {
  const { url, connectionLimit } = options;
  const adapter = new PrismaMariaDb({
    ...parseConnectionUrl(url),
    connectionLimit,
  });

  return { adapter };
}
