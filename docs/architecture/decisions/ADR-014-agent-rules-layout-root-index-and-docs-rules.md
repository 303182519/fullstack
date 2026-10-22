# ADR-014：Agent 规范文档布局——根 `AGENTS.md` 瘦身为「宪法 + 路由索引」，细则集中到 `docs/rules/`

- 状态：已采纳（2026-10-22）
- 日期：2026-10-22
- 影响范围：根 `AGENTS.md`、`.rules/`（迁至 `docs/rules/`）、`CLAUDE.md`（新增）、`scripts/check-rules-index.mjs`（新增）、`package.json`、12 个既有 ADR（加迁移注记）
- 相关规范：`AGENTS.md`

---

## 1. 背景（事实依据）

- 根 `AGENTS.md` 为 12.8 KB / 27 节，同时承担「跨任务宪法」与「技术栈细则」两种职责，每次会话全量注入。
- `.rules/` 下已存在技术栈拆分（`backend` / `frontend` / `database` / `protocols`），但根文件 §15 / §16 / §17 / §26 与 `.rules/backend/AGENTS.md` §8 / §9 / §10 / §16、`.rules/frontend/AGENTS.md` §13 **逐段重复**——同一规则存在多份副本。
- `.rules` 是隐藏目录，且子文件命名为 `AGENTS.md`，语义错位：它们不是目录级 agent 入口，也不会被工具按目录作用域自动加载。
- 13 个 ADR 中 15 处硬编码引用 `.rules/*`；`docs/plans/nest-admin-soybean-migration.md` §766 另引用 `AGENTS.md` §13 / §14。
- 仓库**无 CI 配置**（全仓无 `.yml`），校验入口仅根 `pnpm lint`；`ADR-001` 记载根 `eslint .` 基线已损坏（68 错误，含既有 `.rules/*.md` 与 `AGENTS.md`）。
- monorepo 结构：`apps/admin-api`、`apps/api`、`apps/admin`、`packages/{auth-core,database,eslint-config,health,redis}`；此前**无任何**嵌套 `AGENTS.md` / `CLAUDE.md`。

## 2. 问题

1. 如何在不丢失任何现有条款的前提下消除重复，并让 agent 只读与当前任务相关的那一份规范？
2. 规范文件放在哪里，才能同时被人（code review、ADR 体系）和 agent 发现？
3. 移动后 15 处 ADR 引用失效，如何在**不篡改 ADR 历史**的前提下恢复可导航性？

## 3. 决策（最终）

### D1 三层布局：宪法 + 技术栈 + 横切 + 协议

- 根 `AGENTS.md` 只保留跨任务恒定适用的宪法（使命、工程优先级、思考纪律、最小安全变更、架构分层、输出规范、自我评审、完成的定义、黄金准则）与规范路由索引。
- `docs/rules/stack/` 保留技术栈维度（`backend.md` / `frontend.md` / `database.md`）——agent 的第一检索直觉是「我在改前端还是后端」。
- `docs/rules/cross-cutting/` 承载 6 个跨栈文件：安全与鉴权、并发与幂等、面向失败的设计、API 契约与 DTO、测试与校验、变更管理（Git / 依赖 / ADR）。**技术栈文件不再复制这些内容**，只保留链接指向。
- `docs/rules/protocols/` 保留任务协议（bug / feature / refactor）。
- `docs/rules/` 内**不设第二份索引**，避免产生第二个路由事实源。

### D2 位置：`.rules/` → `docs/rules/`，文件名改为语义名

- D3 已排除目录级就近加载，位置不再受工具约束，因此选择非隐藏、与 `docs/` 同域、可被 code review 自然发现的位置。
- 子文件由 `AGENTS.md` 改为 `backend.md` / `frontend.md` / `database.md` 等语义名：只有根 `AGENTS.md` 是 agent 入口。

### D3 不引入目录级 `AGENTS.md`

- monorepo 子包（`apps/*`、`packages/*`）**不放**各自 `AGENTS.md`；本地落地约定沿用既有「包内 README」先例（如 `apps/admin-api/src/shared/caching/README.md`）。
- 理由：集中式布局下再开 9 个入口，会产生 9 份待腐烂的副本，与「单一事实源」直接冲突。

### D4 文本原样搬迁，本次不新增规范内容

- 所有下沉文本保持原措辞；仅允许三类结构性改动：章节重编号、boilerplate 头部清理、被抽走的重复段落删除。
- 新增规范（Redis 细则、测试细则、API 契约细则、Git 与 PR 细则）延后到独立 PR。

### D5 ADR 不可变：加迁移注记，不改正文

- 12 个 ADR 各加一行注记，说明 `.rules/*` → `docs/rules/*` 以及根文件章节号变化；正文保持历史原貌。

### D6 工具桥接用 import，不复制、不 symlink

- 新增根 `CLAUDE.md`，以 `@AGENTS.md` 指向真源。
- 不复制内容（复制即复发重复）；不使用符号链接（Windows 下需 `core.symlinks` + 开发者模式，跨机器行为不一致）。

### D7 死链只做客观可判定的自动化检查

- 新增零依赖脚本 `scripts/check-rules-index.mjs` + `pnpm docs:check`：校验索引路径存在，且 `docs/rules/` 下无孤儿文件。
- 不引入 eslint 自定义规则，不纳入 `turbo.json` 的 `lint` 依赖链（仓库无 CI 载体，且根 lint 基线已坏）。
- 不做「行数上限」「禁止复制段落」等无法机械判定的规则，交由 code review。

## 4. 备选方案与取舍

- **A. 维持单一大文件（否决）**：继续全量注入，重复与作用域缺失问题不变。
- **B. 只加目录级 `AGENTS.md` 而不重构（否决）**：本地约定会越写越多，形成第二套规范来源。
- **C. 纯按关注点扁平切分、废除技术栈维度（否决）**：与 agent 的检索直觉相反，且丢失「改哪一侧」的路由信息。
- **D. 直接改写 ADR 正文中的路径（否决）**：ADR 是已接受的历史决策记录，就地改写破坏不可变性。
- **E. 把死链检查做成 eslint 规则（否决）**：为一条检查引入插件 / 规则，成本收益严重不匹配。

## 5. 后果

**正面**

- 根文件由 400+ 行降至 227 行；agent 每次只读宪法 + 1 份规范文件。
- 并发 / 幂等 / 鉴权 / 安全等跨栈规则各只有一份事实源。
- 跨工具只需一个真源，新增工具入口的成本降到一行。

**负面 / 风险**

- 根文件实际 227 行，**高于设计时估算的 ≈110 行**：三份清单（思考纪律、自我评审、黄金准则）按 D4 原样保留未压缩。如需进一步瘦身，可将「自我评审」「完成的定义」下沉，但会让横切层混入 checklist 语义——该取舍未做，留待后续决定。
- `CLAUDE.md` 的 `@AGENTS.md` import 行为**待本地实测**；若无效则退化为「链接 + 明文指令」。
- `docs/plans/nest-admin-soybean-migration.md` §766 仍引用 `AGENTS.md` §13 / §14，本次未改（路线图为活文档，不属于 ADR 不可变范畴，留待后续一并处理）。
- 既有死链 `docs/architecture/decisions/ADR-000-template.md`（原根文件 §23 引用）实际不存在，本次仅记录，未新建模板。
- 根 `eslint .` 基线 68 错误未修，不阻塞本次，但影响后续「校验通过」的可信度。
- 本环境无法启动 `git`，改动未做版本控制；`git add` / `git commit` 需人工执行。

## 6. 实施记录

- **C1（纯移动）**：6 个文件由 `.rules/` 迁至 `docs/rules/{stack,protocols}/`。
- **C2（去重 + 根瘦身）**：新建 6 个横切文件；三个栈文件去重并重新编号；根 `AGENTS.md` 重写为宪法 + 路由索引。
- **C3（配套）**：`CLAUDE.md`、`scripts/check-rules-index.mjs`、`package.json#docs:check`、12 个 ADR 迁移注记、本 ADR。

## 7. 验证方式

1. `git diff -M --stat`：C1 的 6 个文件识别为 rename，无整段文本丢失。
2. 逐节核对：原 27 节每一节都有明确归属（留在根 / 下沉到某文件），无悬空。
3. `node scripts/check-rules-index.mjs`：退出码 0，且报告「无死链、无孤儿」。
4. 冒烟演练：让 agent 只读执行「修改 `packages/database` 的 schema」，确认它只加载根 + `docs/rules/stack/database.md`。
5. **不把 `pnpm lint` 变绿作为验收标准**（基线已坏）。

## 8. 后续变更（2026-10-22）：协议层瘦身为「仓库特有约束层」，与 agent skills 双层衔接

布局不变（仍为 D1 三层），只改内容。

### D8 协议层定位变更

`docs/rules/protocols/{bug,feature,refactor}.md` 由「完整工作流」降级为**增补层**：通用推理流程交给已安装的 agent skills（`diagnosing-bugs` / `implement` / `codebase-design`，详见 §8 末说明），协议只保留两类内容——

- 协议骨架：顺序性要求（先定义需求与范围、先复现再假设、先定不变约束再动手）；
- 本仓库特有约束：状态归属判定、数据层影响评估、链路边界、架构红线、回归复核面。

每份由 ~120 行降至 ~40 行。

### D9 重复内容改为指针

协议中已在 `AGENTS.md` 或 `docs/rules/cross-cutting/*` 存在事实源的章节（现有架构调研、API 契约、失败场景、验证范围、最小安全变更、报告格式）改为指针表，不再复制——D4 原则的延续。

### D10 路由表显式声明 skill 依赖

- 根 `AGENTS.md` §10 的三行协议路由写明「先触发 skill X，本协议只补仓库特有约束」。
- §11 新增 `Installed skills` 小节：已装 skill 位于 `.agents/skills/`，清单与来源见根 `skills-lock.json`，不确定路由时先触发 `ask-matt`。

### D11 `docs:check` 增加 skill 名校验

`scripts/check-rules-index.mjs` 增加第三条检查：扫描 `AGENTS.md` 与 `docs/rules/**/*.md` 中形如 ``skill `name` `` 的引用，校验 `.agents/skills/<name>/SKILL.md` 存在。
**只做单向校验**（已安装但文档未提及的不报）：41 个已装 skill 中绝大多数不应出现在规范文档里，反向校验会产生永久噪音。

### 变更原因

仓库已安装 31 个 mattpocock skills（`.agents/skills/`，来源见 `skills-lock.json`），但 `AGENTS.md` §11 与三份协议**均未提及**，两套工作流互不认识：agent 可能只走 skill 而漏掉 Redis / 鉴权 / 并发等仓库特有检查，也可能只读协议而不知有更强的通用流程。

### 未验证项

本环境无法启动 shell / node，`node scripts/check-rules-index.mjs` **未实机执行**（与 §5 既有遗留一致），新增的 skill 名正则与路径仅人工核对。
