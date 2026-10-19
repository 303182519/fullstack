# ADR-011：业务错误码组织方式

- 状态：已采纳（2026-10-19）
- 日期：2026-10-19
- 影响范围：`apps/admin-api/src/modules/`（auth / dept / user / dict 及后续所有业务模块）、`apps/admin-api/src/common/exceptions/`
- 相关规范：`AGENTS.md`、`.rules/backend/AGENTS.md`；前置文档：`ADR-005`（多租户）、`ADR-007`（认证）、迁移路线图 `docs/plans/nest-admin-soybean-migration.md`

---

## 1. 背景（事实依据）

- 上游 build-server 项目将所有模块的错误码集中在 `src/common/exceptions/` 目录下一模块一文件，每个文件内含 `XXXExceptionCode` 常量对象 + `XXXExceptionMap` 完整映射表（code → message + status），10 个模块文件体量均在 1–3KB（证据：GitHub `src/common/exceptions/` 目录结构，含 auth / permission / user / role / post / job / storage / error / disabled-endpoint / base.exception.ts 共 11 个文件）。
- 本仓库 `shared/auth/auth.errors.ts` 已实现「常量对象 + 错误工厂函数」模式：`AuthBizCode`（as const）定义码值，`authErrors` 导出 `invalidCredentials()` / `accountLocked(minutes)` 等命名工厂（证据：`auth.errors.ts` 全文）。该模式已在 auth.service.ts / 全局过滤器中完整落地。
- 本仓库其余三个已实现模块（dept / user / dict）的错误码内联散落在各自 `*.service.ts` 文件头部（dept 第 15–21 行、user 第 21–30 行、dict-type 第 18–23 行 + dict-data 第 20–25 行），调用处使用 `throw conflict('消息', DEPT_BIZ.CYCLE)` 模式——错误码常量与消息分离、消息在调用处硬编码。
- 码规范已在各文件注释中标注为 MMSNN（MM = 模块编号，S = 子类型，NN = 序号），但无单一信源文档列出已分配编号段：auth=10、user=20、role=30、menu=40、dept=50、tenant=60、dict=80——分散在每个文件的局部注释中，无法防止未来模块撞号。
- 本仓库已有 `common/exceptions/base.exception.ts`（`BaseException extends HttpException`，携带 `code?: string`）和 `common/exceptions/business.exception.ts`（`businessException/notFound/conflict/badRequest/forbidden` 轻量工厂）作为基础设施。

## 2. 问题

企业级多租户后台的业务错误码需要解决：

1. **集中管理 vs 模块内聚**：散落 service 头部导致新人不知道去哪找码表、跨模块协作时码段冲突无法在编译期发现；但全部集中到 common/ 目录又会让 common 层膨胀、删除整个模块时容易漏删。
2. **消息归属**：错误消息（message）应该硬编码在定义处还是调用处？硬编码在调用处意味着同一个错误码可能在不同 service 里被写出三种不同文案、批量调整困难。
3. **码段分配规范**：MMSNN 的 S（子类型）含义需要明确；未来 P2–P4 新增 10+ 模块时，如何防止撞号。

## 3. 决策（最终）

### D1 集中位置：co-located 到模块目录

每个模块在自身目录下新建 `errors.ts` 文件（如 `src/modules/dept/errors.ts`），包含：

- `XxxBizCode`：`as const` 导出的错误码常量对象
- `xxxErrors`：错误工厂对象，每个方法返回预携带 code + status + message 的 `BaseException`

auth 模块因位于 `shared/auth/`（跨模块共享基础设施，不是单一业务模块目录），保留原位 `shared/auth/auth.errors.ts`，命名保持 `AuthBizCode` + `authErrors`。

**取舍**：
- **否决 common/exceptions/ 集中**：本项目 P0–P4 预计 20+ 模块，全部拉到 common/ 会让基础设施层膨胀（上游 build-server 只有 10 个模块，可接受）。且删除某个业务模块时，其异常文件不会被自然一起删除，属于无关残留风险。
- **否决 service 内联**：新人定位成本高、码段冲突无编译期保护。
- **选择 co-located**：模块自包含（service / dto / errors 同目录），删除模块时一并移除；同时保持"一模块一 errors.ts"的集中纪律——**不是散到每个 service 文件里**。

### D2 命名规范：推广 auth 风格

| 元素 | 规范 | 示例 |
|------|------|------|
| 常量对象 | `<ModuleName>BizCode`（PascalCase + BizCode） | `DeptBizCode`、`UserBizCode`、`DictBizCode` |
| 工厂对象 | `<moduleName>Errors`（camelCase + Errors） | `deptErrors`、`userErrors`、`dictErrors` |
| 常量 key | 全大写 snake_case（TypeScript 常量惯例） | `NOT_FOUND`、`HAS_CHILDREN`、`INVALID_ROLE` |
| 工厂方法 | camelCase（动词开头或语义短语） | `notFound()`、`hasChildren()`、`usernameExists()` |

**否决的备选**：
- 全大写 `DEPT_BIZ`：与内层 key 全大写形成双重全大写，`throw conflict('消息', DEPT_BIZ.HAS_CHILDREN)` 可读性差。
- 工厂用 `new XxxException()` 类继承：过度设计——auth 模块已证明 `const` 对象工厂 + 函数返回足够灵活且类型安全。

### D3 工厂策略：A 为主、B 为辅、废掉 service 内联

工厂方法分两类：

- **A 类（默认）**：message 硬编码在工厂里，无参数。保证错误消息一处定义、全站一致。
  ```typescript
  notFound: () => authError('部门不存在', HttpStatus.NOT_FOUND, DeptBizCode.NOT_FOUND)
  ```
- **B 类（例外）**：有默认值但允许覆盖 message，或参数化拼接动态内容（如数字）。仅用于确实需要动态值的场景。
  ```typescript
  accountLocked: (minutes: number) => authError(`账号已锁定，请 ${minutes} 分钟后重试`, HttpStatus.TOO_MANY_REQUESTS, AuthBizCode.ACCOUNT_LOCKED)
  ```

**严禁**在 service 内写 `throw conflict('消息', CODE)` 模式——必须通过工厂。service 内允许使用的唯一 throw 形式是 `throw xxxErrors.someMethod()`。

迁移时**纯重构不动 message 文案**，文案优化留待后续迭代。

### D4 MMSNN 子类型规范

MMSNN = **MM**（模块编号，2 位十进制）+ **S**（子类型，1 位字母）+ **NN**（序号，2 位十进制，模块内递增）。

| 子类型 | 含义 | 典型 HTTP Status | 示例 |
|--------|------|-----------------|------|
| A | 调用方 / 请求 / 资源错误 | 400 / 401 / 403 / 404 / 409 | `NOT_FOUND`(404)、`CYCLE`(409)、`INVALID_ROLE`(400) |
| B | 系统内部 / 基础设施依赖错误 | 502 / 503 | `AUTH_UNAVAILABLE`(503) |
| C | 业务规则冲突 / 系统级异常（预留） | 422 / 500 | 模块内序号从 C01 起编，当前无实际使用，预留以便未来扩展（如并发乐观锁冲突、数据一致性检查失败） |

**设计意图**：A/B 覆盖当前可预见的错误类别，C 作为未来扩展槽位——不需要立即使用但先占好"位"，避免将来需要时再修改规范。

### D5 模块编号注册表

**当前已分配**（单一信源，写入本 ADR；后续新增模块必须先更新此表再使用编号）：

| 编号 | 模块 | 位置 | 错误文件 |
|------|------|------|----------|
| 10 | 认证 | `shared/auth/` | `auth.errors.ts` ✅ 已存在 |
| 20 | 用户 | `modules/user/` | `errors.ts`（本次新建） |
| 30 | 角色 | `modules/role/` | 待建 |
| 40 | 菜单 | `modules/menu/` | 待建 |
| 50 | 部门 | `modules/dept/` | `errors.ts`（本次新建） |
| 60 | 租户 | `modules/tenant/` | 待建 |
| 70 | 参数配置 | `modules/config/` | 待建 |
| 80 | 字典 | `modules/dict/` | `errors.ts`（本次新建） |

**编号分配纪律**：
- 按模块在业务域的出现顺序递增分配；不回收、不复用已删除模块的编号（防止历史日志歧义）。
- 子类型内序号 **NN** 从 01 起按出现顺序递增；同一子类型内不跳号。
- dict 模块当前 type（80A01–80A03）与 data（80A05–80A07）之间跳过了 80A04——迁移时保持原样纯重构，不重排序号。

## 4. 备选方案与取舍

- **A. 全部集中到 common/exceptions/（否决）**：20+ 模块会让 common 层膨胀；删除模块时异常文件残留风险高；上游 build-server 仅 10 模块可接受，本项目规模翻倍不适用。
- **B. 每个 service 各自定义（否决）**：新人定位成本高；码段冲突无编译期保护；同一错误码的消息在不同 service 里可能出现多种写法。
- **C. 上游式 ExceptionMap（否决）**：`AuthExceptionMap[AuthExceptionCode.XXX]` 查表比 `authErrors.xxx()` 冗长、IDE 补全路径更长；且 message/status 分离在 Map 里比封装在工厂里更难批量调整。auth 模块的工厂模式已验证可行且更简洁。
- **D. 先不写 ADR 等模块 ≥10 再写（否决）**：当前已实现 4 个模块、P1 结束后将有 7 个；模块编号注册表若不及时记录，P2 新增时很容易撞号。轻量 ADR 成本远低于未来排障成本。

## 5. 后果

**正面**

- 码表有单一信源（模块内 errors.ts），新人一眼找到；同一模块内所有 service 共用同一份码常量 + 工厂。
- 模块编号注册表写入本 ADR，未来新增模块先查表再分配编号，杜绝撞号。
- 工厂模式保证错误消息一处定义、全站一致；批量调整（如国际化）时只需改工厂文件。
- 推广 auth 已验证的模式，迁移到 dept/user/dict 时无需引入新概念、学习成本为零。

**负面 / 风险**

- 每个模块多一个 errors.ts 文件——增加文件数但换取了可维护性；企业级项目这是合理的 trade-off。
- **lint 规则缺失**：当前仓库尚无 lint 规则强制禁止 service 内联定义错误码常量或直接 `throw notFound('msg', CODE)`。**残风险**：未来有人可能在新 service 里写回内联模式。缓解措施：AGENTS.md + 本 ADR 双文档约束 + PR review 人工检查。后续可考虑新增 eslint 自定义规则（如检测 service 文件内 `const XXX_BIZ` 或 `throw conflict.*, *[A-Z]` 模式），但非本次重构范围。
- 工厂方法比直接 `throw xxx()` 多一层间接——性能影响可忽略（函数调用开销远低于一次 DB 查询）。

## 6. 验证

| 校验 | 命令 | 预期 |
|------|------|------|
| 类型检查 | `pnpm --filter admin-api exec tsc --noEmit` | 0 错误 |
| Lint | `pnpm --filter admin-api exec eslint <改动文件>` | 0 问题 |
| 构建 | `pnpm --filter admin-api build` | 成功 |
| 单元测试 | `pnpm --filter admin-api test` | 全绿（迁移不改行为，测试应全部继续通过） |

**本次迁移改动范围**（纯重构、message 一字不动）：

| 操作 | 文件 |
|------|------|
| 新建 | `modules/dept/errors.ts` |
| 新建 | `modules/user/errors.ts` |
| 新建 | `modules/dict/errors.ts` |
| 修改 | `modules/dept/dept.service.ts`（删除内联 DEPT_BIZ + 改 import + 改 throw 为工厂调用） |
| 修改 | `modules/user/user.service.ts`（删除内联 USER_BIZ + 改 import + 改 throw 为工厂调用） |
| 修改 | `modules/dict/dict-type.service.ts`（删除内联 DICT_BIZ + 改 import + 改 throw） |
| 修改 | `modules/dict/dict-data.service.ts`（删除内联 DICT_BIZ + 改 import + 改 throw） |

auth 模块已符合新规范，不做改动。
