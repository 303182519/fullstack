# 重构协议（仓库特有约束层）

> **通用模块设计与深化流程见 skill `codebase-design`**（大范围结构扫描见 skill `improve-codebase-architecture`，回归保障见 skill `tdd`）。
> 本协议**不重复**通用推理步骤，只补充本仓库的架构红线与回归复核面。

## 1. 协议骨架

1. **梳理现有行为**：理解系统当前的真实运行逻辑，不凭代码表象重构
2. **定位结构性问题**：耦合度过高 / 代码重复 / 职责归属模糊 / 可测试性差 / 模块过大 / 抽象不合理
3. **明确重构目标**：必须具体可落地——「让代码更整洁」不构成目标
4. **确定不变约束项**：明确写出绝对不能改动的业务行为
5. **设计目标架构**：定义依赖流向与模块职责归属
6. **增量落地**：小步推进，每一步都不改变原有业务行为

## 2. 架构红线（本仓库特有，不得跨越）

- 分层方向不可倒置：React → Zustand / React Query → API → NestJS → Prisma / MySQL；Redis 只作缓存与协同。
- 业务规则由后端掌握，前端不得复制一份判定逻辑。
- 前端鉴权不能作为安全防线，安全判定必须留在后端。
- 服务端状态由 React Query 持有，不得迁移进 Zustand；反之亦然。

> 分层定义见 `AGENTS.md` §5

## 3. 回归复核维度（本仓库特有）

逐项确认：对外公开行为 · API 行为 · 状态处理逻辑 · 缓存逻辑 · 数据库逻辑 · 权限鉴权 · 性能表现。

现有测试用例必须先跑通；必要时补充回归测试覆盖。

## 4. 指针表（事实源在别处，按需读取，本协议不复制）

| 主题 | 事实源 |
| --- | --- |
| 最小安全变更与行为保留 | `AGENTS.md` §4 |
| 接口契约兼容性 | `docs/rules/cross-cutting/api-contract-and-dto.md` |
| 并发与幂等影响 | `docs/rules/cross-cutting/concurrency-and-idempotency.md` |
| 缓存一致性 | `docs/rules/cross-cutting/failure-and-resilience.md` |
| 数据层（模型 / 迁移 / 索引） | `docs/rules/stack/database.md` |
| 验证范围与测试 | `docs/rules/cross-cutting/testing-and-verification.md` |
| 何时需要写 ADR | `docs/rules/cross-cutting/git-and-change-management.md` |

## 5. 输出

报告需包含：当前存在的问题 · 重构目标 · 不变约束项 · 架构结构改动 · 行为验证结果 · 剩余风险点。格式规范见 `AGENTS.md` §6。
