import type { CoverageOptions, InlineConfig } from 'vitest/node';

/**
 * Vitest 共享测试配置
 *
 * 常量 + base 对象形态：各消费包保留 thin vitest.config.ts，
 * spread baseTestConfig 后按需局部 override。
 * 纯类型依赖（vitest/node），零运行时依赖，故无需构建即可被 vitest 加载。
 */

// ────────────────────────── 基础常量 ──────────────────────────

/** 测试文件匹配模式（相对包根，统一布局：包根 __tests__/ 目录） */
export const TEST_PATTERNS = ['__tests__/**/*.test.ts'];

/** 覆盖率统计的源码范围 */
export const SOURCE_PATTERNS = ['src/**/*.ts'];

/** 覆盖率排除文件 */
export const COVERAGE_EXCLUDE = ['**/*.test.ts', '**/index.ts', '**/*.d.ts', '**/vitest.setup.ts'];

// ────────────────────────── 基础配置 ──────────────────────────

/**
 * 基础测试配置
 *
 * - environment 固定 node：当前消费方（axios 走 msw 网络层 mock、redis/health 为 NestJS 包）均无 DOM 需求，
 *   未来 web 层 UI 包出现时由该包自行 override happy-dom
 * - 不开 globals：测试显式 import vitest API，保持仓库既有风格
 */
export const baseTestConfig: InlineConfig = {
  environment: 'node',
  include: TEST_PATTERNS,
};

/**
 * 基础覆盖率配置（备用，不默认启用）
 *
 * 默认启用会让每次 vitest run 都收集覆盖率并要求安装 @vitest/coverage-v8；
 * 需要时消费包自行合并本对象或使用 `vitest run --coverage`。
 */
export const baseCoverageConfig: CoverageOptions = {
  provider: 'v8',
  include: SOURCE_PATTERNS,
  exclude: COVERAGE_EXCLUDE,
};
