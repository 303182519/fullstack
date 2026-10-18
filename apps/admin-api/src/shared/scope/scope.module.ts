import { Global, Module } from '@nestjs/common';
import { ScopeResolverService } from './scope-resolver.service.js';

/**
 * 操作作用域解析（ADR-009）：字典 / 参数等「平台级 + 租户级」双层数据的
 * 统一作用域注入点。@Global 供各业务模块直接注入。
 */
@Global()
@Module({
  providers: [ScopeResolverService],
  exports: [ScopeResolverService],
})
export class ScopeModule {}
