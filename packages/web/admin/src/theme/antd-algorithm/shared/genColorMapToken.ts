// ============================================================================
// genColorMapToken.ts —— 「颜色类 MapToken」的生成器集合
//
// 这个文件在整条主题链路里的位置：
//   SeedToken（用户给的主色 / 背景色 / 文字色）
//        ↓  algorithm/default|dark/index.ts 遍历默认色系
//   本文件的三个工具：genPaletteVars（色板别名）、genSemanticColors（语义色）、genColorMapToken（中性色）
//        ↓
//   MapToken（antd 组件真正读取的派生 token）
//
// 可以把它理解成三件事：
//   1) genPaletteVars   —— 把「一个色系 11 档色板」摊平成三种键名（antd / UnoCSS / Tailwind）
//   2) genSemanticColors—— 把色板按「档位配置」翻译成 colorPrimaryBg、colorPrimaryHover 这类语义 token
//   3) genColorMapToken —— 只负责中性色（背景 / 文字 / 边框 / 填充）这一块，并补上遮罩色、白色
//
// 为什么主色和功能色的语义 token 不在这里生成？
//   因为它们要在 algorithm 入口里「遍历 defaultPresetColors 逐个色系」生成，本文件只提供可复用的工具函数。
// ============================================================================

// 只导入类型：ColorMapToken 是 antd 颜色类 MapToken 的结构定义，SeedToken 是种子 token 的结构定义。
// 用 import type 是为了让这两行在编译后被完全擦除，不产生任何运行时 require / import。
import type { ColorMapToken, SeedToken } from 'antd/lib/theme/interface';
// ColorMap：本模块自定义的「档位号 → 十六进制颜色」映射；
// PaletteGenerators：调用方注入的「中性色生成器」，目的是解耦——本文件不知道亮色/暗色怎么算中性色，由调用方决定。
import type { ColorMap, PaletteGenerators } from '../types';

// antd 组件内部真正读取的档位是 1~10（比如 token.blue1），这里固化成只读元组，循环时能拿到精确的字面量类型。
/** AntD 1-10 档位索引 */
export const ANTD_INDEXES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;

// Tailwind 风格档位 50~950。色板本身是按这套档位算出来的，1~10 只是它的「压缩别名」。
/** Tailwind 风格 50-950 档位索引 */
export const TAILWIND_INDEXES = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950] as const;

// ----------------------------------------------------------------------------
// 语义色配置：定义「哪一档负责哪种语义」
//
// 这是本文件的核心设计：色板只有档位（1~10 / 50~950），但 antd 组件要的是语义
// （背景用哪档？hover 用哪档？文字用哪档？）。配置对象把两者连接起来，
// 好处是亮色/主色/功能色可以各自换一套映射，而生成代码只有一份。
// ----------------------------------------------------------------------------

/**
 * 语义色档位配置
 *
 * 设计原则（亮色语境）：
 * - 1-2（50-100）：背景
 * - 3-4（200-300）：边框
 * - 5（400）：hover
 * - 6（500）：主色
 * - 7（600）：active
 * - 5-7（400-600）：文字相关
 *
 * 这里的数值是「色板档位号」，不是颜色值。生成时用它去查 ColorMap 取具体颜色。
 */
export interface SemanticColorConfig {
  /** active（按下 / 选中）时用的档位，一般比主色深一档 */
  active: number;
  /** 背景色档位（浅底） */
  bg: number;
  /** 背景 hover 档位 */
  bgHover: number;
  /** 边框色档位 */
  border: number;
  /** 边框 hover 档位 */
  borderHover: number;
  /** 通用 hover 档位 */
  hover: number;
  /** 主色档位，决定 colorPrimary 本身取哪一档 */
  main: number;
  /** 文字色档位（用于浅底上的彩色文字） */
  text: number;
  /** 文字 active 档位 */
  textActive: number;
  /** 文字 hover 档位 */
  textHover: number;
}

// 主色（colorPrimary）专用映射。
// 文字直接用主色 6 档：主色本身就是强调色，浅底上 6 档对比度足够。
/** 主色语义配置 */
export const PRIMARY_SEMANTIC_CONFIG: SemanticColorConfig = {
  // active 用 7 档（比主色 6 档更深一档），按下时视觉变重
  active: 7,
  // 背景用最浅的 1 档，保证浅底不抢前景文字
  bg: 1,
  // 背景 hover 稍深一点，作为「鼠标移入的表态」
  bgHover: 2,
  // 边框用 3 档
  border: 3,
  // 边框 hover 用 4 档
  borderHover: 4,
  // 通用 hover 用 5 档
  hover: 5,
  // 主色取 6 档（色板锚点通常在 500，视觉上就是「品牌色」）
  main: 6,
  // 文字直接用 6 档
  text: 6,
  // 文字 active 用 7 档
  textActive: 7,
  // 文字 hover 用 5 档（略亮，暗示可交互）
  textHover: 5,
};

// 功能色（success / warning / error / info）专用映射。
// 与主色的差别集中在 hover 和 text：
//   - hover 用 4 档（更浅），因为功能色常用于浅底标签，hover 再深容易糊
//   - text 用 9-10 档（更深），因为功能色文字必须在小字号下也满足对比度
/** 功能色语义配置（success、warning、error、info） */
export const FUNCTIONAL_SEMANTIC_CONFIG: SemanticColorConfig = {
  // active 仍用 7 档
  active: 7,
  // 背景用 1 档（最浅）
  bg: 1,
  // 背景 hover 用 2 档
  bgHover: 2,
  // 边框用 3 档
  border: 3,
  // 边框 hover 用 4 档
  borderHover: 4,
  // 功能色的 hover 用 4 档（比主色的 5 档更浅，避免浅底标签糊成一团）
  hover: 4,
  // 主色仍取 6 档
  main: 6,
  // 文字取 9 档（更深），保证浅底上的可读性
  text: 9,
  // 文字 active 取 10 档（最深）
  textActive: 10,
  // 文字 hover 取 8 档（比常规文字深一点但不到 active）
  textHover: 8,
};

// genSemanticColors 的入参形状：只要是这三个字段就够，不绑定具体调用方。
interface GenSemanticColorsOptions {
  // 该色系的完整色板（1~10 与 50~950 都在里面），生成时按档位号查表
  colors: ColorMap;
  // 用哪套档位映射（主色 or 功能色）
  config: SemanticColorConfig;
  // 色名，支持 'colorPrimary' 或 'Primary' 两种写法
  name: string;
}

/**
 * 归一化色名
 *
 * 目标是把 'colorPrimary' / 'primary' 这类输入统一成「小写开头、无 color 前缀」的形式，
 * 例如全部变成 'primary'，这样才能拼出 `primary1`、`primary-1` 这种色板变量名。
 *
 * 注意：上方旧注释写的是 `→ 'Primary'`，但实现里 `charAt(0).toLocaleLowerCase()`
 * 明显是转成小写，实际结果是 `'primary'`。以实现为准。
 */
function normalizeColorName(name: string): string {
  // 若以 'color' 开头就砍掉这 5 个字符（'colorPrimary' → 'Primary'）；否则原样保留（'blue' → 'blue'）
  let normalized = name.startsWith('color') ? name.slice(5) : name;
  // 强制首字母小写（'Primary' → 'primary'），保证键名风格统一、不会拼出 `Primary1` 这种大小写混杂的键
  normalized = normalized.charAt(0).toLocaleLowerCase() + normalized.slice(1);
  // 返回归一化后的名字，供 genPaletteVars 拼键名
  return normalized;
}

/**
 * 为单个色系生成语义色
 *
 * 输入是「色板 + 档位配置 + 色名」，输出是一组以 color 开头的语义 token。
 *
 * @example
 *   // 下面三种写法等价（都会产出 colorPrimary、colorPrimaryActive、colorPrimaryBg ...）：
 *   genSemanticColors({ name: 'colorPrimary', ... })
 *   genSemanticColors({ name: 'Primary', ... })
 *   genSemanticColors({ name: 'primary', ... })
 */
export function genSemanticColors({ colors, config, name }: GenSemanticColorsOptions): Record<string, string> {
  // 先假定调用方传什么就用什么，后面再按需去掉 'Color' 前缀
  let colorName = name;
  // 判断是否是「主色形态」：只有首字母大写的 'ColorXxx' 才算。
  // 这是调用方的约定——algorithm 入口会先 charAt(0).toUpperCase() 再传进来，
  // 所以实际调用时这里恒为 true；但作为公开工具函数仍兼容直接传 'colorPrimary' 的写法。
  const isMainColor = name.startsWith('Color');
  // 是主色形态就砍掉开头的 'Color'（'ColorPrimary' → 'Primary'），后续会拼成 `color${colorName}`
  if (isMainColor) {
    colorName = name.slice(5);
  }

  // 主色额外多给一个「不带 color 前缀的短键」，例如 `primary: '#6366F1'`。
  // 用处：业务侧想直接读 token.primary，或者给 CSS 变量起短名，不用再写 colorPrimary。
  // 非主色（isMainColor === false）时给空对象，展开后不产生任何额外键。
  const extra = isMainColor
    ? { [colorName.charAt(0).toLocaleLowerCase() + colorName.slice(1)]: colors[config.main] }
    : {};
  // 一次性返回所有语义 token。
  // 注意这里的 `as Record<string, string>`：它只是「告诉 TS 别报 index 可能 undefined」，
  // 运行时并不会补值——如果色板缺档，字段值真的会是 undefined。
  return {
    // 展开短键（仅主色有）
    ...extra,
    // 主色本体：colorPrimary = 6 档
    [`color${colorName}`]: colors[config.main],
    // 按下 / 选中态：colorPrimaryActive = 7 档
    [`color${colorName}Active`]: colors[config.active],
    // 浅背景：colorPrimaryBg = 1 档
    [`color${colorName}Bg`]: colors[config.bg],
    // 浅背景 hover：colorPrimaryBgHover = 2 档
    [`color${colorName}BgHover`]: colors[config.bgHover],
    // 边框：colorPrimaryBorder = 3 档
    [`color${colorName}Border`]: colors[config.border],
    // 边框 hover：colorPrimaryBorderHover = 4 档
    [`color${colorName}BorderHover`]: colors[config.borderHover],
    // 通用 hover：colorPrimaryHover = 5 档
    [`color${colorName}Hover`]: colors[config.hover],
    // 彩色文字：colorPrimaryText（功能色是 9 档，主色是 6 档）
    [`color${colorName}Text`]: colors[config.text],
    // 彩色文字 active：colorPrimaryTextActive
    [`color${colorName}TextActive`]: colors[config.textActive],
    // 彩色文字 hover：colorPrimaryTextHover
    [`color${colorName}TextHover`]: colors[config.textHover],
    // 断言：让 TS 认可这是一个纯 string 字典；类型层面不校验真实取值是否缺失
  } as Record<string, string>;
}

/**
 * 生成色板变量（1-10 与 50-950 两套档位）
 *
 * 为什么要三套键名？
 * - antd 组件内部读的是紧凑键：`blue1`、`blue2` …（无分隔符）
 * - UnoCSS / 业务样式习惯连字符：`blue-1` … `blue-10`
 * - Tailwind 习惯 50~950：`blue-50` … `blue-950`
 * 三套必须指向同一批颜色值，否则同一色系在组件里和业务样式里会对不上。
 */
export function genPaletteVars(name: string, colors: ColorMap): Record<string, string> {
  // 先把色名归一化（'colorPrimary' → 'primary'），拼键名时用这个
  const colorName = normalizeColorName(name);

  // 用普通对象累积结果：键是「色名+档位」，值是十六进制颜色
  const result: Record<string, string> = {};

  // 第一轮：按 antd 的 1~10 档位生成两种写法
  //   `blue1` … `blue10`   —— antd 组件内部真正读取的键
  //   `blue-1` … `blue-10` —— 业务样式 / UnoCSS 的写法
  // 两种写法写同一个值，保证「组件看到的」和「业务拿到的」一致。
  for (const i of ANTD_INDEXES) {
    // 取该档颜色；用 `|| ''` 而不是 `??`：即使值是空串也退化成空串，目的只是绝不把 undefined 写进 CSS 变量
    const color = colors[i] || '';
    // antd 紧凑键
    result[`${colorName}${i}`] = color;
    // 连字符别名
    result[`${colorName}-${i}`] = color;
  }

  // 第二轮：按 Tailwind 的 50~950 档位生成 `blue-50` … `blue-950`
  // 注意这套键与第一轮的 `blue-1`…`blue-10` 不重叠，是并存的另一套命名，不会互相覆盖。
  for (const i of TAILWIND_INDEXES) {
    // 同样缺失档位时退化成空串，避免 undefined 进入 token
    result[`${colorName}-${i}`] = colors[i] || '';
  }

  // 返回全部别名
  return result;
}

/**
 * 默认导出：生成「中性色」部分的 MapToken
 *
 * 只负责中性色（背景、文字、边框、填充），再加遮罩色和白色两个常量。
 * 主题色（colorPrimary 等）不在这里生成——那部分由 algorithm 入口逐个色系调用本文件的工具函数产出，
 * 因为不同色系需要不同的档位配置，放在这里会变成一个大 if 分支。
 *
 * 第二个参数用「注入生成器」的方式：本文件不关心亮色还是暗色，
 * 具体算法由 algorithm/default|dark 传进来，这样同一份汇总逻辑能复用两次。
 */
export default function genColorMapToken(
  // 种子 token：这里只用到 colorBgBase（背景基色）和 colorTextBase（文字基色）两个字段
  seed: SeedToken,
  // 注入的中性色生成器；约定了「给基色，返回一整套中性色 token」
  { generateNeutralColorPalettes }: PaletteGenerators,
): ColorMapToken {
  // 从种子 token 解构出中性色的两个基准色（注意它们都是可选字段，缺省时由下游实现兜底）
  const { colorBgBase, colorTextBase } = seed;

  // 调注入的生成器，得到 background / text / border / fill 等中性色
  // 兜底逻辑在具体实现里：亮色缺省 '#FFFFFF' / '#1F1F1F'，暗色缺省 '#000' / '#FFFFFF'
  const neutralColors = generateNeutralColorPalettes(colorBgBase, colorTextBase);

  // 合并中性色与两个固定常量返回
  return {
    // 先铺开中性色（背景、文字、边框、填充）
    ...neutralColors,
    // 遮罩层颜色：弹窗 / 抽屉打开时盖在页面上的黑色半透明，固定值而非派生，保持与 antd 观感一致
    colorBgMask: 'rgba(0, 0, 0, 0.45)',
    // 纯白：antd 多个组件（如反色按钮文字）需要一个稳定的白色，不随主题变化
    colorWhite: '#fff',
    // 断言为 ColorMapToken：因为上面额外带了固定常量、且 neutralColors 的类型来自自定义生成器，
    // 结构上与 antd 的定义不严格重合，这里靠断言收口（不是运行时校验）
  } as ColorMapToken;
}
