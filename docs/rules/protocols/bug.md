# Bug 排查协议（仓库特有约束层）

> **通用诊断循环见 skill `diagnosing-bugs`**。
> 本协议**不重复**通用推理步骤，只补充本仓库的链路边界与回归面。

## 1. 协议骨架

1. **复现**：expected / actual / 复现步骤 / 受影响环境；无法复现必须明说
2. **区分客观事实与主观猜测**，不要把猜想当既定事实
3. **假设 → 证据 → 根因**：自问「系统为什么会允许出现这种异常状态」，不停留在表象
4. **最小安全修复**：修根因，改动最小
5. **回归验证**：补充或更新回归测试，执行自动化验证

## 2. 链路追踪（本仓库特有）

```
用户操作 → 前端 → 状态（React / Zustand / React Query）→ API → NestJS
         → Prisma / MySQL · Redis · 第三方外部服务 → 响应 → UI
```

- 只排查与该 BUG 相关的层级，不要全链路铺开。
- Redis **不是权威数据源**（见 `AGENTS.md` §9）：缓存与库不一致时，不得只改缓存了事。
- 鉴权判定以后端为准，前端的显隐不构成安全边界。

## 3. 回归复核面（本仓库特有）

改动会影响哪些面，逐项确认：对外公开行为 · API 行为 · 状态处理逻辑 · 缓存逻辑 · 数据库逻辑 · 权限鉴权 · 并发竞态 · 错误处理链路。

## 4. 指针表（事实源在别处，按需读取，本协议不复制）

| 主题 | 事实源 |
| --- | --- |
| 证据来源与排查纪律 | `AGENTS.md` §3 |
| 缓存用途与降级 | `docs/rules/cross-cutting/failure-and-resilience.md` |
| 并发与竞态 | `docs/rules/cross-cutting/concurrency-and-idempotency.md` |
| 鉴权与错误暴露 | `docs/rules/cross-cutting/security-and-authorization.md` |
| 验证范围与测试 | `docs/rules/cross-cutting/testing-and-verification.md` |
| 后端日志 / 事务 / 外部调用 | `docs/rules/stack/backend.md` |
| 前端状态与浏览器运行时 | `docs/rules/stack/frontend.md` |

## 5. 输出

报告需包含：Expected · Actual · Root Cause · Fix · Regression Risk · Validation。格式规范见 `AGENTS.md` §6。
