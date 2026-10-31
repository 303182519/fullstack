# antd-algorithm

基于 OKLCH 色板的 Ant Design 主题算法实现，用来**替换 antd 自带的 `@ant-design/colors` 色板生成逻辑**。

antd 在计算 `MapToken` 时默认使用 `theme.defaultAlgorithm` / `theme.darkAlgorithm`，其色板由 `@ant-design/colors`
产出。本模块提供两个签名兼容的替代算法（`derivative` / `derivativeDark`），把「色板生成 + 语义色映射 + 中性色映射 +
字体 / 间距 / 圆角 / 控件高度」全部自己算一遍，从而得到更现代、可控、可按 Tailwind 档位命名的 token 体系。

---

## 1. 在 antd 中的位置

```
SeedToken（用户配置的种子值：colorPrimary / fontSize / borderRadius ...）
        │
        ▼
theme.algorithm(seedToken, mapToken?)    ← 本模块 derivative / derivativeDark
        │
        ▼
    MapToken（真正驱动组件样式 / CSS 变量的派生 token）
        │
        ▼
AliasToken / 组件样式
```

`theme.algorithm` 的入参签名就是 `(seedToken, mapToken?) => MapToken`，因此这两个函数可以**直接**塞进
`ConfigProvider`：

```tsx
import { derivative, derivativeDark } from '@/theme/antd-algorithm';
import { ConfigProvider, theme } from 'antd';

<ConfigProvider
  theme={{
    algorithm: isDark ? derivativeDark : derivative,
    token: { colorPrimary: '#6366F1' },
  }}
>
  <App />
</ConfigProvider>;
```

> 注意：antd 的 `theme.algorithm` 本身可以是单函数或数组。本模块的算法是**全量重算**（不叠加官方
> `defaultAlgorithm`），亮色下不建议再把 `theme.defaultAlgorithm` 放进数组；暗色算法内部会在 `mapToken` 缺省时
> 自己调用一次 `defaultAlgorithm(token)` 兜底。

---

## 2. 目录结构

```
antd-algorithm/
├── index.ts                      # 统一出口（所有公开 API）
├── seed/
│   └── index.ts                  # 默认种子色（Tailwind 500/600 色值）+ seedToken
├── algorithm/
│   ├── default/
│   │   ├── index.ts              # derivative：亮色算法（主入口）
│   │   └── colors.ts             # 亮色色板 + 亮色中性色
│   └── dark/
│       ├── index.ts              # derivativeDark：暗色算法（主入口）
│       └── colors.ts             # 暗色色板 + 暗色中性色
├── shared/
│   ├── colorAlgorithm.ts         # 颜色工具转发层（@fedstack/color）
│   ├── genColorMapToken.ts       # 中性色 token + 调色板变量 + 语义色生成
│   ├── genCommonMapToken.ts      # 动效 / 线宽 / 圆角
│   ├── genControlHeight.ts       # 控件高度 SM/XS/LG
│   ├── genFontMapToken.ts        # 字号 / 行高 / 标题字号
│   ├── genRadiusMapToken.ts      # 圆角系列
│   └── genSizeMapToken.ts        # 间距系列
└── types/
    └── index.ts                  # ColorMap / 生成器函数类型 / antd 类型再导出
```

---

## 3. 算法主流程

两个 algorithm 入口（`algorithm/default/index.ts`、`algorithm/dark/index.ts`）结构一致：

1. **遍历 `defaultPresetColors`**（`blue`、`geekblue`、`cyan`、`purple`、`red`、`colorPrimary` …）。
2. 对每个颜色调 `generateColorPalettes(baseColor)` 得到 1-10 + 50-950 双档位色板。
3. 分两类处理：
   - **预设色**（键名不以 `color` 开头，如 `blue`）：只产出色板变量（`blue1`、`blue-1`、`blue-500` …）。
   - **功能色**（键名以 `color` 开头，如 `colorPrimary` / `colorError`）：色板变量 **+** 语义色
     （`colorPrimaryBg`、`colorPrimaryHover`、`colorPrimaryActive`、`colorPrimaryBorder`、`colorPrimaryText` …）。
4. 展开 `genFontMapToken` / `genSizeMapToken` / `genControlHeight` / `genCommonMapToken` / `genColorMapToken`
   等生成器。
5. 与种子 token 合并返回完整 `MapToken`。

### 3.1 色板生成（亮色）

`algorithm/default/colors.ts` 调 `@fedstack/color` 的 `generateOklchPaletteAnchored(baseColor, 500)`，把用户的
主色**锚定在 500 档**，再向两端按 OKLCH 亮度曲线展开 50→950 共 11 档。

导出到 antd 的 1-10 档映射（与 50-950 一一对应）：

| antd 档位 | 色板档位 | 语义 |
| --- | --- | --- |
| 1 | 50 | 最浅背景 |
| 2 | 100 | 背景 hover |
| 3 | 200 | 边框 |
| 4 | 300 | 边框 hover |
| 5 | 400 | hover 色 |
| 6 | 500 | 主色 |
| 7 | 600 | active 色 |
| 8 | 700 | 文字 hover |
| 9 | 800 | 文字 |
| 10 | 900 | 文字 active |

同时额外输出 `50/100/…/950` 的 Tailwind 档位键，方便在业务样式里直接取用。

### 3.2 色板生成（暗色）

`algorithm/dark/colors.ts` 用 `generateDarkModePalette(baseColor, 500)`。档位语义仍是 **50 最亮 / 950 最暗**，
因此暗色不能靠翻转档位号，而是**直接取色板暗端**：

| antd 档位 | 取色 | 用途 |
| --- | --- | --- |
| 1 | 950 | 最深背景 |
| 2 | 900 | 背景 hover |
| 3 | 800 | 边框 |
| 4 | 700 | 边框 hover |
| 5 | 400 | hover（暗底需要更亮） |
| 6 | 500 | 主色 |
| 7 | 600 | active |
| 8 | 400 | 文字 hover |
| 9 | 500 | 文字 |
| 10 | 600 | 文字 active |

暗色算法还有两处特调（对齐 antd 官方暗色实现）：

- `colorPrimaryBg = colorPrimaryBorder`、`colorPrimaryBgHover = colorPrimaryBorderHover`，让选中项背景有足够对比。
- `colorError` 额外覆盖 `colorErrorBgActive` 与 `colorErrorBgFilledHover`（两档混色 50%）。

### 3.3 中性色（背景 / 文字 / 边框 / 填充）

`generateNeutralColorPalettes(bgBase, textBase)` 不用 antd 的「透明度叠加」方案，而是**实色混合**：

- 亮色：`bgBase = #FFFFFF`，`textBase = #1F1F1F`。
- 暗色：`bgBase = #000`，`textBase = #FFFFFF`。
- 文字 4 级用 `mixColor(bgBase, textBase, 0.88/0.65/0.45/0.25)`；填充 4 级亮色 0.12/0.06/0.04/0.02、暗色 0.18/0.12/0.08/0.04。
- 背景层级：亮色 `Layout(-3)` → `Container(0)` → `Elevated(+2)`；暗色 `Layout(0)` → `Container(+8)` → `Elevated(+12)` → `Spotlight(+26)`。
- 边框：亮色三级混色 0.15 / 0.10 / 0.06；暗色三级提亮 26 / 26 / 19。

实色方案的好处：颜色稳定可预测、不受背景透明度影响、对比度可控。

---

## 4. 共享生成器

| 文件 | 作用 | 关键映射 |
| --- | --- | --- |
| `genColorMapToken.ts` | 中性色 token 汇总 + 调色板变量 + 语义色 | 追加 `colorBgMask: rgba(0,0,0,.45)`、`colorWhite: #fff` |
| `genSemanticColors` | 由色板 + 配置生成 `color*Bg/BgHover/Border/BorderHover/Hover/Text/TextActive/TextHover` | `PRIMARY_SEMANTIC_CONFIG` 与 `FUNCTIONAL_SEMANTIC_CONFIG` 各一套档位 |
| `genPaletteVars` | 生成 `name1…name10`（antd 内部紧凑键）、`name-1…name-10`（UnoCSS 风格）、`name-50…name-950`（Tailwind 风格） | 大写名先被 `normalizeColorName` 归一为小写首字母 |
| `genFontMapToken.ts` | 基于 UnoCSS 字号表（xs…9xl）生成 `fontSize*` / `fontSizeHeading*` / `lineHeight*` / `Text*` / `LineHeight*` | `baseFontSize` 同时作为 rem→px 基准 |
| `genSizeMapToken.ts` | 基于 `sizeUnit` 生成 `sizeXXS…sizeXXL` 与间距表 / CSS 变量 | `sizeUnit` 默认 4 |
| `genRadiusMapToken.ts` | 基于 `borderRadius` 生成 `borderRadiusXS/SM/(base)/LG/Outer`，另有 2XL/3XL/4XL/Full 扩展 | 倍率表 `RADIUS_MULTIPLIERS` |
| `genControlHeight.ts` | `controlHeightSM = ×0.75`、`XS = ×0.5`、`LG = ×1.25` | — |
| `genCommonMapToken.ts` | `motionDurationFast/Mid/Slow`、`lineWidthBold`，并入圆角 | — |
| `colorAlgorithm.ts` | 转发 `@fedstack/color` 的 `mixColor / adjustLightness / lightenColor / darkenColor` | 纯 re-export，无实现 |

### 4.1 语义色档位

```ts
PRIMARY_SEMANTIC_CONFIG   // bg:1 bgHover:2 border:3 borderHover:4 hover:5 main:6 active:7 text:6 textActive:7 textHover:5
FUNCTIONAL_SEMANTIC_CONFIG // bg:1 bgHover:2 border:3 borderHover:4 hover:4 main:6 active:7 text:9 textActive:10 textHover:8
```

功能色（success / warning / error / info）的 hover 用 4 档、text 用 9-10 档，是为了在浅底上保证文字对比度。

---

## 5. 默认种子色

`seed/index.ts` 的 `defaultPresetColors` 使用 Tailwind 主色（`colorPrimary = #6366F1`、`colorSuccess = #10B981`、
`colorError = #F43F5E` 等），`seedToken` 在其上补 `fontSize: 14`、`borderRadius: 6`。

> 实际生效的种子值仍来自 `ConfigProvider.theme.token` 与 antd 内置默认值；`seedToken` 只是**推荐的基线**，
> 供「不传 token 也能拿到一套完整 Tailwind 风格主题」的场景使用。

---

## 6. 公开导出（`index.ts`）

- 算法：`derivative`（亮色）、`derivativeDark`（暗色）
- 色板生成器：`generateColorPalettes` / `generateNeutralColorPalettes`（亮色），
  `generateDarkColorPalettes` / `generateDarkNeutralColorPalettes`（暗色）
- 基色常量：`LIGHT_BG_BASE`、`LIGHT_TEXT_BASE`、`DARK_BG_BASE`、`DARK_TEXT_BASE`
- 种子：`defaultPresetColors`、`seedToken`
- 颜色工具：`adjustLightness`、`darkenColor`、`lightenColor`、`mixColor`
- Token 生成器：`genColorMapToken`、`genCommonMapToken`、`genControlHeight`、`genFontMapToken`、`genRadiusMapToken`、
  `genSizeMapToken`
- 常量/工具：`ANTD_INDEXES`、`TAILWIND_INDEXES`、`PRIMARY_SEMANTIC_CONFIG`、`FUNCTIONAL_SEMANTIC_CONFIG`、
  `genPaletteVars`、`genSemanticColors`、`FONT_SIZES`、`LINE_HEIGHTS`、`genFontSizes`、`getLineHeightRatio`、`remToPx`、
  `RADIUS_MULTIPLIERS`、`calcRadius`、`genExtendedRadiusToken`、`genRadiusSizes`、`genRadiusVars`、`SPACING_MULTIPLIERS`、
  `calcSpacing`、`genSpacingSizes`、`genSpacingVars`
- 类型：`SemanticColorConfig`、`FontSizeKey`、`RadiusSizeKey`、`ExtendedRadiusToken`、`RadiusMapToken`、`SpacingSizeKey`，
  以及 `types/index.ts` 的全部类型

---

## 7. 与 antd 原生算法的差异

| 维度 | antd 原生 | 本模块 |
| --- | --- | --- |
| 色板来源 | `@ant-design/colors`（RGB 插值） | `@fedstack/color` 的 OKLCH（亮色锚定 500）/ 暗色专用色板 |
| 色板档位 | 仅 1-10 | 1-10 **+** 50-950（Tailwind 命名） |
| 中性色 | 透明度叠加 | 实色 `mixColor` / `adjustLightness` |
| 语义色 | 内置于 `genColorMapToken` | 配置化（主色 / 功能色两套 `SemanticColorConfig`） |
| 字体 token | `fontSize*` / `lineHeight*` | 额外输出 `TextXs…Text9xl`、`LineHeightXs…LineHeight9xl`、`fontHeight*` |
| 圆角 token | 5 个 | 5 个 + `borderRadiusXL/2XL/3XL/4XL/Full`（`genExtendedRadiusToken`） |
| 暗色选中背景 | `colorPrimaryBg` 走淡色 | 特调为 `colorPrimaryBorder` |

---

## 8. 本仓适配说明

从上游 `@skyroc/*` 迁移到本仓 `@fedstack/*` 时，做了两类**纯适配改动**，未改动任何运行时取值逻辑：

1. **依赖替换**：`@skyroc/color` → `@fedstack/color`，并在 `packages/web/admin/package.json` 中声明
   `"@fedstack/color": "workspace:*"`。
2. **严格索引访问适配**：本仓开启 `noUncheckedIndexedAccess`，数组/元组解构会得到 `T | undefined`，因此：
   - `algorithm/default/colors.ts`、`algorithm/dark/colors.ts`：解构色板时加 11 项元组断言
     （亮色断言为 `ColorPaletteWithOklch`，暗色为 `ColorPalette`）。
   - `algorithm/{default,dark}/index.ts`：`colors[1]` / `colors[3]` 加非空断言。
   - `shared/genFontMapToken.ts`：`fontSizes` / `lineHeights` / `lineHeightsPx` 三个 `map()` 结果加 13 项 `number`
     元组断言。

这些断言只是给编译器看的数据形状承诺，运行时行为与上游一致。

---

## 9. 使用与注意事项

- **入口**：`src/theme/index.ts` 已 `export * from './antd-algorithm'`，因此可从 `@/theme` 直接取用。
- **尚未接线**：目前仅完成模块迁移，`apps/admin/src/features/antd/AntdProvider.tsx` 仍只有 `<AntdApp>`；要让算法生效，
  需在其外层加 `ConfigProvider` 并传入 `theme.algorithm`。
- **`as` 类型断言**：多处 `as MapToken` / `as ColorMapToken` / 元组断言属于**收窄而非校验**，若上游 token 结构变化不会
  在编译期报错，改动字段时需人工核对 antd 的 `MapToken` 定义。
- **非标准 token 键**：`blue1`、`blue-1`、`blue-500`、`TextXs`、`borderRadius2XL` 等并非 antd 官方 token 名，
  antd 会原样透传（可用于 `token.blue1` 或 CSS 变量），但不保证在任何组件内部被消费。
- **`baseFontSize` 语义**：`genFontMapToken(token.fontSize)` 把 `fontSize`（默认 14）当作 rem→px 基准，
  因此 `TextBase = 14px` 而非 16px，整条 `Text*` / `LineHeight*` 都会随之缩放。
- **内部导入路径**：`genCommonMapToken.ts`、`genControlHeight.ts` 从 `antd/es/theme/internal` 取 `SeedToken`，
  `shared/*` 多处用 `antd/lib/theme/interface`；升级 antd 大版本时需重点回归这两条路径。
- **遗留命名**：`genCommonMapToken.ts` 中类型名 `SkyrocCommonMapToken` 仍是上游包名残留，后续可统一为 `Fedstack*`。
- **`memoize` 缺失**：与 antd 官方 algorithm 不同，这里没有对同输入缓存 `MapToken`；切换主题时会全量重算，量大但可接受。
