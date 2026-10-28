# date/ — 日期工具分层架构

## 分层结构

```
date/
├── dayjs.ts        # 基础层：dayjs 实例 + 插件注册
├── constants.ts    # 基础层：共享常量 + 类型
├── format.ts       # 能力层：格式化（值 → 字符串）
├── calc.ts         # 能力层：运算（加减差 + 时间戳 + 相对时间）
├── boundary.ts     # 能力层：边界（起止点 + 范围）
├── compare.ts      # 能力层：判断（谓词函数）
└── index.ts        # 出口层：barrel export
```

## 分层依据

按**「操作意图」**分文件，不按功能数量或代码行数。判断一个函数该放哪里，问一个问题：

> **调用者拿到结果后，要用它做什么？**

| 意图           | 文件          | 判断标准                                           |
| -------------- | ------------- | -------------------------------------------------- |
| 拿来**展示**   | `format.ts`   | 返回值是 `string`，用于 UI 渲染                    |
| 拿来**计算**   | `calc.ts`     | 返回值是 `Dayjs` 或 `number`，用于后续运算         |
| 拿来**圈范围** | `boundary.ts` | 返回值是 `Dayjs` 或 `[Dayjs, Dayjs]`，表示时间区间 |
| 拿来**做判断** | `compare.ts`  | 返回值是 `boolean`，用于条件分支                   |

## 依赖关系

```
constants.ts ← dayjs.ts
     ↑             ↑
     |             |
format.ts  calc.ts  boundary.ts  compare.ts
     ↑             ↑              ↑            ↑
     └─────────────┴──────────────┴────────────┘
                         |
                     index.ts（barrel export）
```

- `dayjs.ts` 是最底层，负责初始化 dayjs 实例和注册插件，只做一次
- `constants.ts` 定义共享类型和常量，被所有能力层引用
- 四个能力层文件**互不依赖**，各自只依赖 `dayjs.ts` + `constants.ts`
- `index.ts` 只做 re-export，不包含任何逻辑

## 追加规则

新增函数时，按返回值类型对号入座：

- 返回 `string`（给人看的） → `format.ts`
- 返回 `number` 或 `Dayjs`（给程序算的） → `calc.ts`
- 返回 `Dayjs` 或 `[Dayjs, Dayjs]`（表示时间区间） → `boundary.ts`
- 返回 `boolean`（做判断的） → `compare.ts`

如果某一类函数数量增长到 20+ 且有明确子分类，可以继续拆分（例如 `boundary.ts` 拆为 `start-end.ts` + `range.ts`），但当前规模不需要。

新增 dayjs 插件 → 在 `dayjs.ts` 中统一注册，不要在其他文件中散装 `extend`。
