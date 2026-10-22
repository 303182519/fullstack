import type { IJobHandler } from '../types/job.types.js';
import { Injectable, Logger } from '@nestjs/common';
import { jobErrors } from '../errors.js';

/**
 * 任务处理器注册表（P3b，与上游 build-server JobRegistryService 对齐）。
 *
 * 业务模块接入方式：
 *   1. 实现 IJobHandler<TPayload, TResult>，声明 readonly name
 *   2. 构造函数注入 JobRegistryService，调用 registry.register(this)
 *   3. 把 handler 放进业务模块 providers（通过 JobsModule import 拿到 registry）
 *
 * 注册时机：NestJS 依赖注入创建 handler 实例时——构造函数内同步注册
 * （NestJS 构造时依赖已全部解决，registry 先被创建好）。
 */
@Injectable()
export class JobRegistryService {
  private readonly logger = new Logger(JobRegistryService.name);
  // Map value type 放宽到 any——registry 做动态路由（按 name 找 handler，payload 形状由提交方保证），
  // 运行时无泛型约束；业务 handler 实现时可自由收窄 TPayload/TResult，handle 参数仍走 IJobContext<unknown>
  // 收窄后的 handler 实现（IJobHandler<ConcretePayload, ConcreteResult>）因函数参数逆变无法直接赋值给
  // IJobHandler<unknown, unknown>，所以 registry 用 any 作为桥接。
  private readonly handlers = new Map<string, IJobHandler<any, any>>();

  /**
   * 注册一个任务处理器。
   *
   * 构造函数内同步调用——handler 实例化即注册，NestJS 启动后 registry 已完整。
   * handler 泛型由业务模块自行收窄，registry 侧不做运行时类型校验。
   *
   * @throws Error 重复注册同一 name（handler.name 全局唯一）
   */
  register(handler: IJobHandler<any, any>): void {
    if (this.handlers.has(handler.name)) {
      throw new Error(`重复注册任务处理器: ${handler.name}`);
    }
    this.handlers.set(handler.name, handler);
    this.logger.log(`注册任务处理器: ${handler.name}`);
  }

  /**
   * 按 name 获取 handler。不存在时抛 JOB_HANDLER_NOT_FOUND。
   */
  get<T = unknown, R = unknown>(name: string): IJobHandler<T, R> {
    const handler = this.handlers.get(name);
    if (!handler)
      throw jobErrors.handlerNotFound(name);
    return handler as IJobHandler<T, R>;
  }

  has(name: string): boolean {
    return this.handlers.has(name);
  }

  /** 列出所有已注册处理器名（SSE 调试、健康检查可用） */
  listNames(): string[] {
    return [...this.handlers.keys()].sort();
  }
}
