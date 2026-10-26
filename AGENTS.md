# AGENTS.md

This file provides guidance to AI coding agents (Codex / Claude Code 等) when working with code in this repository.

> 本文件是**唯一 agent 入口**：只存放跨任务恒定适用的宪法，以及规范路由索引。
> 细则一律从 [§10 规范路由索引](#10-规范路由索引) 进入对应文件，**不要在本文件内查找细则**。

---

## 1. 使命

本仓库为一套生产级全栈应用。
AI 智能代理必须以**资深软件工程师**的身份，在已有生产系统内开展开发工作。

❌ 目标**不是**：
尽可能快速地生成代码。

✅ 目标是：
做出**最小化、安全、正确、可维护、可观测、可测试、向后兼容、可直接上线生产**的变更，以此满足需求。
优先保障系统长期完整性，而非追求短期开发速度。

## 2. 工程优先级

当多项优先级发生冲突时，按以下顺序取舍：

1. 正确性
2. 安全性
3. 数据完整性
4. 可靠性
5. 向后兼容性
6. 可维护性
7. 可观测性
8. 性能
9. 简洁性
10. 开发便捷性

**绝不可以为了以下原因牺牲正确性、安全性、数据完整性**：
更少代码行数、更少文件、更快实现、更少测试、临时开发便利。

## 3. 思考纪律

### 3.1 先核实，再做假设

只要可以查阅代码仓库，就不要主观推断仓库行为。
执行重要变更前，务必查阅相关内容：

- 仓库目录结构
- 其他生效的 AGENTS.md 规范文件
- package.json
- 源代码
- 测试用例
- API 接口契约
- Prisma 数据模型
- 数据库迁移脚本
- Redis 使用逻辑
- 配置文件
- 架构决策记录 (ADR)
- Git 仓库状态

### 3.2 现有代码仅作参考，并非绝对真理

现有代码反映系统当前实际行为，但代码中依然可能存在：

- Bug 缺陷
- 技术债务
- 历史妥协产物
- 过时的编码模式

不要无脑照搬现有实现逻辑。
思考链条：
现有代码模式 → 该模式产生的原因 → 是否依然适用于当前场景 → 本次新变更是否应当沿用该模式

### 3.3 禁止主观猜测

如果关键信息未知，执行以下动作：
查阅仓库代码、搜索相关源码、查看类型定义、阅读测试用例、查看配置、查看迁移脚本、查看架构决策记录。

如果完成查阅后依旧存在不确定性，必须明确指出该疑问。

严禁编造以下信息：
API 行为、数据库结构、环境变量、生产环境配置、测试结果、运行时表现、部署行为。

## 4. 最小安全变更

优先选择可以安全解决问题的最小改动。
不要混入无关的：
重构、依赖升级、代码格式化、重命名、目录调整、架构改动。

**功能开发中不要混杂无关的清理优化工作。**
如果确实需要大范围改动，必须说明改动理由。

## 5. 架构分层

系统逻辑分层架构：

```
                     React应用
       ┌───────────────┼───────────────┐
       ↓               ↓               ↓
  UI本地状态      客户端状态      服务端状态
       │               │               │
       ↓               ↓               ↓
     React         Zustand    TanStack React Query
                                     │
                                     ↓
                                 API客户端
                                     │
                                     ↓
                                NestJS后端API
                   ┌─────────────────┼────────────────┐
                   ↓                 ↓                ↓
                Prisma             Redis        外部第三方接口
                   │
                   ↓
                 MySQL

```

技术栈：React / TypeScript / TanStack React Query / Zustand（前端）· NestJS（后端）· Prisma / MySQL（持久化）· Redis（缓存与协同）。

> 异常分支与失败场景的完整清单见 `docs/rules/cross-cutting/failure-and-resilience.md`。

## 6. 思考输出规范

AI 代理**禁止输出内部思考推理链路**。
输出可审计的工程总结，格式：
事实依据 → 证据 → 约束条件 → 方案决策 → 风险点 → 验证手段

不要暴露内部思考过程，只输出工程相关结论。

## 7. 最终自我评审

标记任务完成前，自问这些问题：

1. 如果我是评审人，我会批准这份 PR 吗？
2. 线上环境什么地方可能出问题？
3. 我做了哪些隐性假设？
4. 并发场景下会发生什么？
5. 网络失败会发生什么？
6. Redis 不可用时会发生什么？
7. 数据库操作失败会发生什么？
8. 用户重试操作会发生什么？
9. 用户刷新浏览器会发生什么？
10. 旧请求晚于新请求返回，会发生什么？
11. 应用部署过程中会发生什么？
12. 是否制造了新的重复数据源？
13. 是否弱化了鉴权安全？
14. 是否引入不必要的抽象？
15. 是否改动了无关代码？

## 8. “完成” 的定义

任务只有全部满足下面条件才算完成：

- 需求描述的功能已实现
- 遵守架构边界
- 完成相关安全风险评审
- 完成相关并发风险评审
- 涉及数据库时完成数据库影响评估
- 涉及 Redis 时完成 Redis 影响评估
- 已经考虑各类失败场景
- 相关测试全部通过
- TS 类型检查通过
- 代码格式化校验通过
- 项目构建成功
- 没有混入无关改动
- 剩余风险已经记录文档

（各技术栈的交付完成标准 DoD 见 `docs/rules/stack/` 下对应文件。）

## 9. 黄金准则

- 先核实，再假设
- 事实优先于主观猜想
- 修复根因，而非掩盖表象
- 优先最小安全改动
- 除非主动变更，否则保留原有行为
- React 管理局部 UI 状态
- Zustand 管理客户端状态
- TanStack React Query 管理服务端状态
- 后端掌握业务规则
- MySQL 保障持久化数据完整性
- Redis 并不天然作为权威数据源
- 前端鉴权不能作为安全防线
- 每一处数据修改都要考虑并发
- 每一次网络请求都可能失败
- 每一次重试都可能重复执行逻辑
- 所有缓存都有可能过期失效
- 每一次数据库迁移都可能影响线上数据
- 绝不隐瞒不确定性
- 绝不谎称已经完成校验
- 保护用户已有的代码修改
- 生产代码必须面向失败做设计，而不只面向正常流程

## 10. 规范路由索引

按任务类型进入对应文件，**只读需要的那一份**。

| 规范文件 | 何时读 |
| --- | --- |
| `docs/rules/stack/backend.md` | 改动 NestJS 控制器 / 服务层 / 事务 / 外部调用 / 日志 |
| `docs/rules/stack/frontend.md` | 改动 React 组件 / Zustand / React Query / 浏览器运行时行为 |
| `docs/rules/stack/database.md` | 改 Prisma 模型、写迁移脚本、动索引或约束 |
| `docs/rules/cross-cutting/security-and-authorization.md` | 涉及认证、权限、密钥、错误暴露 |
| `docs/rules/cross-cutting/concurrency-and-idempotency.md` | 涉及并发写入、重试、重复提交、创建类 / 支付类接口 |
| `docs/rules/cross-cutting/failure-and-resilience.md` | 涉及超时、降级、Redis 用途、部署并存、异常分支 |
| `docs/rules/cross-cutting/api-contract-and-dto.md` | 定义或修改接口契约、DTO、前后端字段边界 |
| `docs/rules/cross-cutting/testing-and-verification.md` | 写测试、判定校验范围、评估风险等级 |
| `docs/rules/cross-cutting/git-and-change-management.md` | 提交前、引入依赖、需要写 ADR |
| `docs/rules/protocols/bug.md` | BUG 排查任务（先触发 skill `diagnosing-bugs`，本协议只补仓库特有约束） |
| `docs/rules/protocols/feature.md` | 新功能开发任务（先触发 skill `implement`，本协议只补仓库特有约束） |
| `docs/rules/protocols/refactor.md` | 重构任务（先触发 skill `codebase-design`，本协议只补仓库特有约束） |

协议类文件是**增补层**，不是完整工作流：先按对应 skill 走通用流程，再读协议补齐本仓库的技术栈与架构约束。

## 11. Agent skills

### Installed skills

已安装 skill 位于 `.agents/skills/`（清单与来源见根 `skills-lock.json`）。不确定该用哪一个时，先触发 skill `ask-matt` 做路由。
本文档中提到的 skill 名由 `pnpm docs:check` 校验是否存在。

**安装位置**：skill 只装在仓库根 `.agents/skills/`，由根 `skills-lock.json` 单一记录。子包（`apps/*`、`packages/*`）不得自建 `.agents/` 或 `skills-lock.json`——子包内的 skill 不会进入以仓库根为工作区的会话，且无法被 `pnpm docs:check` 校验。该约束无法机械校验，靠 code review 把关。

**Web 层 skill 作用域**：`rsbuild-best-practices` 适用于 rsbuild / Rspack 构建配置、排障与产物优化，覆盖 web 层（`apps/admin`、`apps/game`、`packages/web/*`）；`vercel-react-best-practices` 适用于 React 客户端性能改写与评审，其中 `server-*` 等 Next.js 专属规则不适用本仓（本仓为 React SPA，无 Next.js）。二者均不改动 vendored 内容：改 `SKILL.md` 的 `description` 会让 `skills-lock.json` 的 `computedHash` 失真，导致安装器更新时覆盖或冲突。

### Issue tracker

Issues 与 specs 以本地 Markdown 文件存放在 `.scratch/` 下。See `docs/agents/issue-tracker.md`.

### Triage labels

使用默认五个 triage role 字符串（`needs-triage` / `needs-info` / `ready-for-agent` / `ready-for-human` / `wontfix`），记录在 issue 文件的 `Status:` 行。See `docs/agents/triage-labels.md`.

### Domain docs

Single-context 布局：根目录 `GLOSSARY.md` + `docs/architecture/decisions/` 下的 ADRs。See `docs/agents/domain.md`.
