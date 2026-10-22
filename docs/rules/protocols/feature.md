# 功能开发协议（仓库特有约束层）

> **通用实现流程见 skill `implement`**（测试驱动的实现节奏见 skill `tdd`）。
> 本协议**不重复**通用推理步骤，只补充本仓库技术栈与架构特有的约束。
> 执行顺序不可跳过：先定义需求与范围，再谈实现。

## 1. 协议骨架

按顺序产出，缺项必须显式说明：

1. **需求定义**：user goal / success criteria / acceptance criteria
2. **范围界定**：in scope / out of scope / affected modules
3. **业务不变约束**：任何场景下都必须为真的规则（不可被打破）

## 2. 状态归属判定（本仓库特有）

新增的每一份数据都要显式判定归属，禁止默认落库或默认进全局 store：

- React：UI 局部状态
- Zustand：客户端状态
- React Query：服务端状态
- backend / database：由后端掌握的业务规则与持久化数据

派生 / 计算得出的状态不单独持有副本。

> 分层定义见 `AGENTS.md` §5；前端落地细则见 `docs/rules/stack/frontend.md`

## 3. 数据层影响评估（本仓库特有）

逐项给出结论（影响 / 不影响）：MySQL · Prisma（是否涉及迁移）· Redis（是否承担权威数据）· 第三方外部接口。

> 见 `docs/rules/stack/database.md`

## 4. 指针表（事实源在别处，按需读取，本协议不复制）

| 主题 | 事实源 |
| --- | --- |
| 现有架构调研 | `AGENTS.md` §3 |
| 接口契约与 DTO | `docs/rules/cross-cutting/api-contract-and-dto.md` |
| 失败 / 异常场景设计 | `docs/rules/cross-cutting/failure-and-resilience.md` |
| 并发与幂等 | `docs/rules/cross-cutting/concurrency-and-idempotency.md` |
| 认证与权限 | `docs/rules/cross-cutting/security-and-authorization.md` |
| 验证范围与测试 | `docs/rules/cross-cutting/testing-and-verification.md` |
| 最小安全变更 | `AGENTS.md` §4 |

## 5. 输出

报告需包含：功能范围 · 架构说明 · 关键技术决策 · 风险点 · 验证情况。格式规范见 `AGENTS.md` §6。
