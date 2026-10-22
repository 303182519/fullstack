# ADR-012：文件存储抽象、上传约束与租户存储配额

- 状态：已采纳（2026-10-19，P3a 设计定稿；实施后补验证）；2026-10-20 修订 D4（见 §7）
- 日期：2026-10-19（修订 2026-10-20）
- 影响范围：`apps/admin-api/src/shared/storage/`（新增）、`apps/admin-api/src/shared/image/`（新增）、`apps/admin-api/src/modules/file/`（新增）、`apps/admin-api/src/config/env.validation.ts`、`packages/database/prisma/schema.prisma`（新增 `SysFile`）、`packages/auth-core`（新增权限码）、`packages/database/src/seed.ts`（菜单同步）
- 相关规范：`AGENTS.md`、`.rules/backend/AGENTS.md`、`.rules/database/AGENTS.md`；前置文档：`ADR-005`（多租户隔离）、`ADR-006`（schema 设计纪律）、`ADR-009`（审计底座）、`ADR-010`（权限码注册表）；路线图 `docs/plans/nest-admin-soybean-migration.md` §6

> **2026-10-22 规范路径迁移注记（ADR-014）**：本 ADR 引用的 `.rules/*` 规范文件已迁至 `docs/rules/*`；根 `AGENTS.md` 已瘦身为「宪法 + 规范路由索引」并重新编号，正文中的 `AGENTS.md §N` 章节号不再对应（如 §15 凭据纪律现位于 `docs/rules/cross-cutting/security-and-authorization.md`、§10「不制造第二真相源」现位于 `docs/rules/stack/frontend.md` §2）。按 ADR 不可变原则，正文保持原貌，请以根 `AGENTS.md` §10 路由索引对新位置。详见 `ADR-014`。

---

## 1. 背景（事实依据）

- 上游 `linlingqin77/Nest-Admin-Soybean@83a83f7` 的文件/OSS 能力为**骨架级**：`sys_oss` / `sys_oss_config` 等表存在但**存储密钥明文入库**；`module/upload` 目录在上游源码中缺失却仍留有指向它的断链 import；`file_md5` 字段无任何实现（秒传/去重未落地）；存储查询**无租户过滤**（证据：P3 调研基线 commit `83a83f7` 全量源码核对）。
- 本仓库 `SysTenant` 已有 `storageLimit` 字段（`BigInt`，默认 `1073741824` = 1 GiB），schema 注释明确「P0 只落字段，管理逻辑 P3 实现」（证据：`packages/database/prisma/schema.prisma` 第 49–51 行）。
- 本仓库依赖方向为 **app → package**；抽包纪律为「框架无关 + ≥2 处复用」（证据：`ADR-003` / `ADR-004` / `ADR-010` 先例）。当前**唯一**的文件消费方是 `apps/admin-api`，`apps/api` 无文件需求。
- `admin-api` 已在用原生扩展依赖 `argon2`（预编译二进制），说明本仓库不排斥原生依赖；且仓库为纯本地 pnpm monorepo，**无 Dockerfile、无 CI workflow**（证据：仓库根目录探查 + P3 调研），`sharp` 的预编译包不存在额外的容器构建适配面。
- 前端表单校验不作为安全防线（`AGENTS.md` §15），上传面的类型/大小约束必须由服务端强制。
- MySQL 唯一索引对 NULL 不生效、平台级数据无 DB 兜底（`ADR-009` D3 已确立的口径）；「不制造第二真相源」是本仓库的既有纪律（`AGENTS.md` §10）。

## 2. 问题

P3a 需要一次性回答五类问题：

1. 存储后端如何抽象，使「本地磁盘」与「S3 兼容对象存储」可切换，且**不把密钥/端点固化进数据库**？
2. 上传面（类型、体积）如何在服务端强约束，避免缓冲式上传成为内存耗尽入口？
3. 图片归一化（封面派生）如何做，才能在未来策略变更时可重算、且不产生重复元数据？
4. 租户存储配额的**权威口径**落在哪：聚合计算还是冗余计数列？
5. 删除时元数据与对象的一致性如何处理？配额如何释放？

## 3. 决策（最终）

### D1 `StorageDriver` 抽象 + 两个实现，驱动由 env 选择

- 定义统一接口 `StorageDriver`：`put(key, buffer, contentType)` / `getStream(key)` / `delete(key)` / `getSignedUrl(key, ttlSeconds)`。
- 两个实现：`LocalStorageDriver`（根目录落盘）与 `S3StorageDriver`（基于 `@aws-sdk/client-s3`，适配 MinIO / 腾讯 COS / 阿里云 OSS 等 S3 兼容端点）。
- **单一活动驱动**由 `STORAGE_DRIVER`（`local` | `s3`，默认 `local`）决定；不做「多配置切换」。
- 落点：`apps/admin-api/src/shared/storage/`，**不抽共享包**（唯一消费方，未达 ≥2 处复用门槛；`apps/api` 出现需求时再按 `ADR-003` 先例沉淀）。

**取舍**：`getSignedUrl` 在本地驱动下无对象存储直连语义（返回代理 URL），接口保留是为「演进路径」——未来切云存储时下载通路无需改控制器。

### D2 存储密钥与端点**不进数据库**，全部走 env（joi 校验）

- 不建上游的 `sys_oss_config` 表；键 `STORAGE_DRIVER`、`STORAGE_LOCAL_ROOT`、`STORAGE_S3_ENDPOINT`、`STORAGE_S3_REGION`、`STORAGE_S3_BUCKET`、`STORAGE_S3_ACCESS_KEY_ID`、`STORAGE_S3_SECRET_ACCESS_KEY`、`STORAGE_S3_FORCE_PATH_STYLE`、`STORAGE_SIGNED_URL_TTL`（默认 300）由 `env.validation.ts` 校验。
- 日志/审计**绝不打印密钥**（`AGENTS.md` §15）。

**取舍**：上游「配置入库 + 后台切换」模式有多配置能力，但把**凭据明文写进业务库**是事故级风险，且本仓库无多存储配置消费方；env 化后切存储 = 改环境变量 + 重启。

### D3 上传面强约束：分类上限 + 类型白名单，全部 env 配置化

- 缓冲式上传（multer `memoryStorage`），**超限在缓冲阶段即中断**，不落盘、不进入业务逻辑。
- 分类上限：`UPLOAD_MAX_BYTES`（图片类，默认 `5242880` = 5 MiB）、`UPLOAD_MAX_BYTES_OTHER`（其它白名单类型，默认 `20971520` = 20 MiB）。
- 类型白名单：`UPLOAD_ALLOWED_IMAGE_TYPES`、`UPLOAD_ALLOWED_FILE_TYPES`（逗号分隔 MIME，启动期 joi 校验）。
- 上传端点**必须配限流**（复用既有 `@nestjs/throttler` + Redis 存储，见限流模块约定）：缓冲式上传是内存压力入口，不限流等于把 DoS 面交给匿名流量。

**取舍**：不引入流式直传（前端直传对象存储）——它会绕过服务端类型/大小校验与审计，且需要前端持临时凭证。

### D4 图片处理：字节级核验（拒绝）+ 封面派生（降级），落点 `shared/image/`

- **核验：失败 = 拒绝上传**。图片类先用 `sharp.metadata()`（只读文件头，不做全量解码）核验字节内容确实是图片，并按 `UPLOAD_IMAGE_MAX_DIMENSION`（默认 `10000`）拒绝宽或高超过该值的图。仅凭 `file.mimetype`（由客户端声明、经 multer 转述）判定「这是图片」是经典绕过点：把任意字节流顶个 `image/png` 头即可穿过 D3 的 MIME 白名单；且 `UPLOAD_MAX_BYTES` 只约束**压缩体积**——一张 5 MiB 的 PNG 可解出 20000×20000（RGBA 约 1.5 GB），不在解码前按住就等于把上传通路变成内存耗尽入口。
- **派生：失败 = 降级为「仅原图」**。核验通过后派生封面：EXIF 自动旋正（手机竖拍不躺倒）→ 限宽 `UPLOAD_COVER_MAX_WIDTH`（默认 `1600`，**不放大小图**，原图小于该宽度则封面尺寸 = 原图尺寸）→ 转 `UPLOAD_COVER_FORMAT`（`webp`（默认）/ `jpeg` / `png`），质量取 `UPLOAD_COVER_QUALITY`（默认 `82`，仅 `webp` / `jpeg` 生效，`png` 走无损压缩忽略此项）。任一环节异常只告警并留空 `cover_*` 列，**不阻断上传**：封面是增强而非前置条件，消费端必须容忍 `coverKey` 为空。
- **两类语义必须分开**：核验不过 = 客户端送了「假图片」（安全事件，拒绝）；派生失败 = 服务端处理能力问题（增强降级，放行）。合成一条「一律抛错」会让封面增强逻辑变成上传前置条件（见 §7 修订记录）。
- **落点**：`apps/admin-api/src/shared/image/`（`ImageProcessorService` + @Global 模块），**不抽共享包**（唯一消费方是 `admin-api`，未达 ≥2 复用门槛，同 D1 判断）；`file` 模块只做管道编排，自身不依赖 `sharp`。
- **保留原图**：原对象与封面对象都在存储后端中；`SysFile` 行同时持有原图与封面的事实（`objectKey` / `coverKey` / `coverWidth` / `coverFormat` / `coverSize`）。
- 封面**不新建 `SysFile` 行、不新建表**，绑定在同一条文件记录上。

**取舍**：保留原图 = 未来改归一化策略时可从原图重算（重算任务属 P4 观察项）；代价是存储占用更高（配额按二者之和计，见 D6）。核验与派生在同一服务内但保持两条独立语义与各自测试面——代价是上传链路多一次文件头解析（不做全量解码，成本可忽略）。

### D5 租户存储配额：`SysTenant.storageLimit` 为上限，用量按**未删除文件行聚合**

- 用量 = `SUM(size + coverSize)`（该租户 `deleted_at IS NULL` 的 `SysFile` 行）；**不落 `storageUsed` 冗余计数列**。
- 上传前预检用量 + 本次体积是否超过 `storageLimit`，超出报业务错误码。
- **并发窗口已接受**：两个并发上传可能同时通过预检、使实际用量小幅超限（与 `ADR-009` D3 平台级唯一并发窗口同一取舍口径）；配额用于「阻止无限增长」，不做精确计费。

**取舍**：冗余计数列（`storageUsed` + 原子 `increment`）读性能更好，但它是**第二真相源**——删除降级、补偿失败、直接改库等路径都会让它漂移，且漂移后无法自证。聚合口径只有一个真相源，且后台管理量级下开销可接受。

### D6 删除：软删元数据 + 物理删对象（best-effort），配额自动释放

- 删除 = `deletedAt` 置位（元数据留痕）+ 物理删除对象；对象删除失败**不回滚**元数据软删，仅 warn 并留下孤儿对象，由**补偿任务**（扫描「已软删但对象仍存在」记录重试物理删除）收口。
- 补偿任务依赖队列能力，**P3a 不建队列**，作为待办随 P3b 的 BullMQ 引入（见 `ADR-013`）。
- 配额随软删自动释放（D5 聚合口径天然满足），无「释放动作」需要额外实现。

**取舍**：不做回收站/恢复——对象已物理删除，恢复语义不成立；上游的「回收站」能力也不在 P3 范围。

### D7 范围裁剪（明确不做）

不做文件夹、分享链接、回收站、版本、秒传（不建 `hash` / `md5` 字段）、分片上传；不做「存储配置管理」页面（D2）。

### D8 下载双通路：默认代理，显式请求才签发直连

- **默认代理通路**：`GET /api/files/{id}/content` 由服务端取对象流式返回，受登录 + 租户作用域约束，可审计。
- **显式直连通路**：仅当请求显式要求直连（`?direct=true`）时，服务端签发**预签名 URL**（`@aws-sdk/s3-request-presigner`），TTL 取 `STORAGE_SIGNED_URL_TTL`（默认 300 秒）；签发**需登录 + 权限**，审计只记「签发」这一动作。
- **不建 `download_count` 字段**：直连通路不经服务端，无法统计；双通路计数口径必然不一致，宁可不记（避免制造不可信的统计真相源）。

**取舍**：直连省服务端带宽，但把访问控制短暂外包给签名 URL（TTL 内谁拿到 URL 谁可下载），且丧失下载计数；故默认代理、直连需显式请求。

## 4. 备选方案与取舍

- **A. 照抄上游（`sys_oss_config` 配置入库 + 密钥明文）**：否决——凭据明文入库、无租户过滤、断链 import，全是需要修掉的缺陷而非可复用设计。
- **B. 只做本地磁盘驱动**：否决——多环境（本地 / 云）部署是既有现实，`S3StorageDriver` 与本地实现共用同一接口，增量成本低。
- **C. 抽 `packages/storage` 共享包**：否决——唯一消费方是 `admin-api`，未达「≥2 处复用」；抽象过早会把尚未稳定（签名、配额、归一化）的边界固化进共享层；`apps/api` 出现真实需求时再抽（`ADR-003 §4 C` 同款判断）。
- **D. 封面独立成 `SysFile` 行 / 独立 `SysFileCover` 表**：否决——制造重复元数据源，且配额口径被拆成两处判定。
- **E. 落 `storageUsed` 计数列**：否决——见 D5 取舍（第二真相源、漂移不可自证）。
- **F. 建 `hash` / `md5` 支持秒传**：否决——无消费方（秒传不在范围），字段无实现即技术债。
- **G. 前端直传对象存储（绕过服务端）**：否决——绕过类型/大小校验与审计，违背 `AGENTS.md` §15。
- **H. 核验与派生「一律抛错」**（同类实现 `build-server/src/shared/storage/image-processor.service.ts` 的做法）：部分采纳——核验失败抛错是对的，但派生失败也抛错会推翻 D4「封面是增强而非前置条件」的口径，把封面变成上传前置条件（封面生成失败即用户传不上图）。
- **I. 核验与派生都留在 `FileService` 私有方法里**：否决——「拒绝」与「降级」是两类语义，混在同一个 try/catch 中无法各自断言；且 `file` 模块会同时承担配额聚合、驱动写入、图片解码三种职责，变更半径与测试成本堆在同一文件上。

## 5. 后果

**正面**

- 存储后端可切换（`STORAGE_DRIVER` 一个环境变量），业务代码只依赖 `StorageDriver` 接口。
- 凭据永不出现在数据库与日志中；密钥轮换 = 改 env。
- 类型/大小/归一化/配额四类约束全部**服务端强制**且 env 可调，前端校验只是体验层。
- 图片类的「类型白名单」不再只信任客户端声明的 MIME：字节解析不过即拒绝（`10A06`），伪装 Content-Type 的落地路径被关闭。
- 配额口径单一（聚合），无「计数列漂移」这一类永不收敛的脏数据。

**负面 / 风险**

- `sharp` 为原生依赖：无 Dockerfile/CI 时无构建适配面（本地已验证 `argon2` 同类可装），但**若将来引入容器化构建，需补 sharp 的平台二进制适配**。
- 缓冲式上传的内存峰值与并发数成正比：**必须**限流（D3）；限流阈值与 `UPLOAD_MAX_BYTES` 需一并评估。
- 聚合配额在并发上传下存在小幅超限窗口（D5 已接受）。
- 对象删除失败会留孤儿对象（成本泄漏）：补偿任务在 P3a 缺失（待 P3b 队列），期间孤儿对象只增不减，需人工巡检兜底。
- 预签名直连在 TTL 窗口内不可撤回：TTL 越小越安全，默认 300 秒是安全与可用性的折中。
- 封面派生失败降级为「仅原图」：消费端必须容忍 `coverKey` 为空，不能假定封面必然存在。
- **行为变更**：伪装成图片的非图片字节 / 像素超限图，从「静默落库（无封面）」变为「400 拒绝」（`10A06`）。只影响新上传，历史行不受影响；上传通路多一次文件头解析（不做全量解码）。

## 6. 验证（P3a 实施后补，计划校验项）

| 校验          | 方法                                                               | 预期                                                  |
| ------------- | ------------------------------------------------------------------ | ----------------------------------------------------- |
| 类型/大小约束 | 上传超限图片、非白名单类型                                         | 缓冲阶段拒绝，未落盘、未入库                          |
| 图片核验      | 上传顶 `image/png` 头的非图片字节                                  | 400 拒绝（`10A06`），未落盘、未入库                   |
| 像素上限      | 上传宽或高 > `UPLOAD_IMAGE_MAX_DIMENSION` 的图                     | 400 拒绝（`10A06`），未落盘、未入库                   |
| 归一化        | 上传大图 / 小图 / 附件（PDF）                                      | 大图缩放至 1600；小图不放大；附件走非图片通路无封面列 |
| EXIF 旋正     | 上传带 Orientation 的竖拍 JPEG                                     | 封面按方向旋正（宽高互换），不躺倒                    |
| 派生降级      | 归一化环节异常                                                     | 上传成功、`coverKey` 为空，配额只计原图               |
| 配额          | 上传至超过 `storageLimit`                                          | 拒绝并返回业务错误码                                  |
| 删除与释放    | 删除文件后重新上传                                                 | 软删留痕、对象消失、配额释放（聚合下降）              |
| 双通路        | 代理下载 / `?direct=true` 签发 / 未登录签发                        | 代理流式返回；签发成功且记审计；未登录 401            |
| 驱动切换      | `STORAGE_DRIVER=local` 与 `=s3`（MinIO）                           | 两驱动行为一致，密钥不入库、不进日志                  |
| 租户隔离      | 跨租户按 id 访问文件                                               | 404（不泄露存在性）                                   |
| 依赖与构建    | `pnpm install` / `build` / `typecheck` / `test`（含 `sharp` 装载） | 全通过，新文件 0 lint 问题                            |

图片核验 / 像素上限 / 归一化 / EXIF 旋正 / 派生降级五项由 `apps/admin-api/src/shared/image/image-processor.service.spec.ts` 覆盖（不依赖库表与存储驱动，纯字节入出）。

## 7. 修订记录

- **2026-10-20，修订 D4（核验与派生的失败语义拆分）**
  - **触发事实**：原 D4 只写了「归一化失败不阻断上传」，未覆盖「客户端伪造 Content-Type 的非真实图片」——该场景下 `sharp` 解析失败会走同一 catch 静默降级，导致 D3 声明的「类型白名单服务端强制」实际退化为「信任浏览器报的 MIME」；同时缺少解码前的像素上界，缓冲式上传（D3）的内存压力面并未被完全按住。
  - **决策**：补齐字节级核验（失败即拒绝，错误码 `10A06`）与 `UPLOAD_IMAGE_MAX_DIMENSION`（默认 `10000`）；把核验与派生抽到 `shared/image/` 的 `ImageProcessorService`，使两类语义各自可测；派生仍保留降级口径（D4 原取舍不变）。
  - **参照**：同类实现 `build-server` 仓库的 `src/shared/storage/image-processor.service.ts`（核验 + 像素上限 + EXIF 旋正 + 输出质量 + 单次取输出元信息）；**未采纳**其「一律抛错」与「硬编码像素上限」，前者见 §4 H，后者按本仓库「配置禁止硬编码」纪律改为 env 化。
  - **影响**：新增 `UPLOAD_COVER_QUALITY`（默认 `82`）、`UPLOAD_IMAGE_MAX_DIMENSION`（默认 `10000`）两个 env 键；`file` 模块不再直接依赖 `sharp`。

</content>
