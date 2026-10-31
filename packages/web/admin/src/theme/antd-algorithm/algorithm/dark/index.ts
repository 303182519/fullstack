// ============================================================================
// algorithm/dark/index.ts —— 暗色主题算法（与 antd `theme.algorithm` 同签名）
//
// 在整条主题链路里的位置：
//   SeedToken（用户给的主色 / 背景基色 / 文字基色）
//        ↓  本文件 derivativeDark
//   MapToken（antd 组件真正读取的派生 token）
//
// 这个文件和亮色 algorithm/default/index.ts 是「同一套骨架 + 三处暗色改动」：
//   1) 色板生成器换成暗色版 generateColorPalettes（generateDarkModePalette 实现）
//   2) 中性色生成器换成暗色版 generateNeutralColorPalettes
//   3) 末尾额外把「选中态背景」colorPrimaryBg 覆盖成 colorPrimaryBorder
//
// 为什么骨架要和亮色一模一样？
//   antd 的算法签名是 (seed, mapToken?) => MapToken，暗色不是另起一套体系，
//   而是「在亮色算出的底座上，把颜色类 token 整体替换掉」。这样字号、尺寸、圆角、
//   动效这些与明暗无关的 token 不必重写一遍，也就不会出现亮暗两套数值漂移。
// ============================================================================

// 只导入类型：MapToken / SeedToken 是 antd 的 token 结构定义，PresetColorType 是预置色系的键类型。
// 用 import type 保证编译后这三行被完全擦除，不产生任何运行时产物。
import type { MapToken, PresetColorType, SeedToken } from 'antd/lib/theme/interface';
// 运行时真正需要的颜色工具：这里只用 mixColor，用来把两档颜色按比例混合（见下方 colorError 分支）。
// 注意它来自本仓 @fedstack/color，而不是上游的 @skyroc/color——迁移时只换了包名，API 一致。
import { mixColor } from '@fedstack/color';
// 默认预置色系清单（blue / purple / colorPrimary / colorInfo ...），共 18 个键。
// 它的作用不是「取颜色值」，而是「决定要遍历哪些色系」——真正的颜色值来自调用方传入的 seed。
import { defaultPresetColors } from '../../seed';
// 从 shared 里取出三个工具 + 一套档位配置：
//   genColorMapToken            —— 中性色汇总（背景 / 文字 / 边框 / 填充）
//   FUNCTIONAL_SEMANTIC_CONFIG  —— 功能色的档位映射表
//   genPaletteVars              —— 把一个色系的 11 档色板摊平成三种键名
//   genSemanticColors           —— 把色板按档位配置翻译成语义 token
import genColorMapToken, {
  FUNCTIONAL_SEMANTIC_CONFIG,
  genPaletteVars,
  genSemanticColors,
} from '../../shared/genColorMapToken';
// 亮色算法。注意这里不是「暗色依赖亮色」的语义妥协，而是把它当成
// 「非颜色 token 的默认产出器」：字号 / 尺寸 / 控件高度 / 圆角 / 动效与明暗无关，
// 复用亮色的产出可以避免在暗色里再维护一份同样数值。
import defaultAlgorithm from '../default';
// 暗色专用的两个生成器：色板（暗端映射）与中性色（实色混合，不用透明度）。
import { generateColorPalettes, generateNeutralColorPalettes } from './colors';

// 把两个生成器再导出一次，方便外部（比如主题调试工具、单测）单独调用它们，
// 不必绕过默认导出、也不必直接依赖 ./colors 这个内部路径。
export { generateColorPalettes, generateNeutralColorPalettes };

/**
 * 暗色主题算法（antd `theme.algorithm` 兼容实现）
 *
 * 相比亮色算法的三处差异：
 *   1) 色板由暗色专用算法生成（替代 antd 原生 @ant-design/colors）
 *   2) 色板到 antd 1-10 档位的映射是「暗色特调」：1-4 取暗端 950-700、5→400、6→500、7→600
 *   3) 末尾用 colorPrimaryBorder 覆盖选中态背景 colorPrimaryBg
 *
 * 产出内容：
 *   - 纯色系（blue / geekblue ...）：只有色板别名（blue1 ... blue10、blue-1 ... blue-10、blue-50 ... blue-950）
 *   - 功能色系（colorPrimary / colorInfo ...）：色板别名 + 语义色（colorPrimaryBg / colorPrimaryHover ...）
 *   - 中性色系：colorText、colorBgContainer、colorBorder 等
 *
 * @param token    种子 token，颜色值的唯一真源
 * @param mapToken 上游算法已经算好的 MapToken（antd 支持算法数组时会传进来）；
 *                 传了就直接复用，没传就现场跑一遍亮色算法拿底座
 */
export default function derivativeDark(token: SeedToken, mapToken?: MapToken): MapToken {
  // 第一步：遍历 18 个预置色系，逐个产出「色板别名 + 语义色」，最后合并成一个大对象。
  // 这里用 Object.keys 拿到的是 string[]，所以后面取 token 时必须断言成 PresetColorType 的键。
  const colorPalettes = Object.keys(defaultPresetColors)
    .map((colorKey) => {
      // 从种子 token 里按色系名取值（如 token.blue、token.colorPrimary）。
      // SeedToken 里这些颜色字段都是可选的，因此 baseColor 的类型是 string | undefined。
      const baseColor = token[colorKey as keyof PresetColorType];

      // 没配这个颜色就返回空对象：空对象在下面的 reduce 里展开等于「什么都没加」，
      // 相当于跳过该色系。用 return {} 而不是 continue，因为这里处在 map 回调里。
      if (!baseColor)
        return {};

      // 用暗色色板生成器把「一个基色」扩成 11 档（50~950）。
      // 暗色的映射规则在 ./colors.ts 里：1-4 取色板暗端、5-7 走中间亮区，不是简单翻转档位号。
      const colors = generateColorPalettes(baseColor);
      // 命名约定决定产出的内容：以 'color' 开头的是「功能色」（colorPrimary / colorSuccess ...），
      // 其余是「纯色板」（blue / purple ...）。⚠️ 这个判定只看前缀，
      // 所以 colorPrimary 也会被归入功能色，后面用的是 FUNCTIONAL_SEMANTIC_CONFIG，
      // 而不是专门给主色准备的 PRIMARY_SEMANTIC_CONFIG（后者本仓没有任何调用方）。
      const isFunctionalColor = colorKey.startsWith('color');

      // 纯色板只输出别名：blue1…blue10、blue-1…blue-10、blue-50…blue-950。
      // antd 不会对 'blue' 读取 colorBlueBg 这类语义键，多产出反而是噪声。
      // 提前 return 也顺便让下面的语义色逻辑只对功能色生效。
      if (!isFunctionalColor) {
        return genPaletteVars(colorKey, colors);
      }

      // 功能色两头都要：先拿到色板别名，再把语义键合并进来。
      // result 之后会被原地修改（补 colorError 的两个键），因此这里用 const 而不是直接内联。
      const result = genPaletteVars(colorKey, colors);

      // 'colorPrimary' → 'ColorPrimary'。
      // genSemanticColors 用 startsWith('Color') 判断「主色形态」，大写化是为了走那条分支，
      // 从而额外产出一个无前缀短键（primary / info / success ...），业务侧可直接读 token.primary。
      const capitalizedKey = colorKey.charAt(0).toUpperCase() + colorKey.slice(1);
      // 按功能色档位表把各档翻译成语义 token：
      //   bg=1 / bgHover=2 / border=3 / borderHover=4 / hover=4 / main=6 / text=9 / textActive=10 / textHover=8
      // 与主色档位表的差异集中在 hover 和 text：功能色 hover 更浅、文字更深，
      // 因为功能色多用于浅底小字号标签，要同时兼顾「不糊」和「可读」。
      const semanticColors = genSemanticColors({
        // 该色系的完整色板，按档位号查表
        colors,
        // 功能色档位映射
        config: FUNCTIONAL_SEMANTIC_CONFIG,
        // 色名，大写形态
        name: capitalizedKey,
      });

      // 只给 error 补两个 antd 会读、但档位配置里没定义的键：
      //   colorErrorBgActive       —— 按下态的错误浅底，直接取 3 档
      //   colorErrorBgFilledHover  —— 填充态错误背景的 hover，取 1 档与 3 档 50% 混合，
      //                              得到介于「最浅背景」与「边框色」之间的过渡色
      // 为什么其他功能色不补？上游就没补——这些键在 success/warning/info 上保持缺失，
      // 属于上游遗留的不对称处理，本次迁移原样保留。
      if (colorKey === 'colorError') {
        // ! 是告诉 TS「色板一定有这一档」；运行时若缺档仍会是 undefined（类型断言不等于兜底）
        result.colorErrorBgActive = colors[3]!;
        // 两档按 0.5 混合；顺序是 (from, to, ratio)，即向 3 档靠一半
        result.colorErrorBgFilledHover = mixColor(colors[1]!, colors[3]!, 0.5);
      }

      // 把语义键合并进色板别名，同一个对象返回。
      // 顺序说明：上面补的两个 error 键不在 semanticColors 里，所以不会被这里覆盖；
      // 若将来 semanticColors 也产出同名键，则以 semanticColors 为准（后写的赢）。
      Object.assign(result, semanticColors);

      // 返回该色系的全部键（色板别名 + 语义色）
      return result;
    })
    // 把 18 个碎片对象合并成一个 MapToken。初始值 `{} as MapToken` 只是让 TS 接受累加起点，
    // 并不是运行时补齐字段。各色系键名互不重叠，所以「后者覆盖前者」在这里不会误伤。
    .reduce<MapToken>((prev, cur) => {
      return { ...prev, ...cur };
    }, {} as MapToken);

  // 第二步：生成中性色（背景 / 文字 / 边框 / 填充 / 遮罩）。
  // 关键在第二个参数：这里注入的是「暗色」版生成器，所以同一份汇总逻辑能算出暗色中性色；
  // 亮色入口注入的就是亮色版。这正是 shared/genColorMapToken 不带明暗判断的原因。
  // ⚠️ 它的返回结果里其实只有中性色 + colorBgMask + colorWhite，不含任何 colorPrimary* 键，
  // 尽管返回类型被断言成了完整的 ColorMapToken（这也是文末两行会取到 undefined 的根因）。
  const colorMapToken = genColorMapToken(token, {
    generateNeutralColorPalettes,
  });

  // 第三步：确定「底座」。
  // antd 支持算法数组（如 [defaultAlgorithm, darkAlgorithm]），此时前一个算法的产出会作为
  // mapToken 传进来，直接复用即可；没有就现场跑一遍亮色算法。
  // 复用的动机：字号 / 尺寸 / 控件高度 / 圆角 / 动效这些非颜色 token 与明暗无关，只算一次更稳。
  const mergedMapToken = mapToken ?? defaultAlgorithm(token);

  // 第四步：按「底座 → 暗色色板 → 暗色中性色 → 特调覆盖」的顺序合并。
  // 展开顺序就是优先级顺序：越靠后越能覆盖前面的同名键。
  return {
    // 底座：包含非颜色 token，也包含亮色的颜色 token（后者马上会被下面两层覆盖掉）
    ...mergedMapToken,
    // 暗色色板别名 + 暗色语义色：覆盖底座里的亮色 colorPrimary / colorPrimaryBg / blue1 ...
    ...colorPalettes,

    // 暗色中性色：覆盖底座里的亮色 colorText / colorBgContainer / colorBorder 等
    ...colorMapToken,

    /**
     * 暗色特调（对应 antd 官方讨论：
     * https://github.com/ant-design/ant-design/issues/30524#issuecomment-871961867）
     *
     * 官方在暗色下用 colorPrimaryBorder 作为「选中项背景」，理由是暗底上更浅的色块
     * 反而不如中深色块有辨识度，直接用描边色做背景反馈更明显。
     *
     * ⚠️ 但按本文件的实际实现，这里取到的是 undefined：
     *   colorMapToken 来自 genColorMapToken，只含中性色 + 遮罩 + 白色，
     *   而 colorPrimaryBorder 实际是 ...colorPalettes 里 genSemanticColors 产的（3 档）。
     *   实测 derivativeDark(seedToken) 得到 colorPrimaryBg === undefined，
     *   即这两行会把上面正确的浅底色「覆盖成空」。
     *   TS 之所以不报错：genColorMapToken 的返回类型被断言为完整 ColorMapToken，
     *   而 antd 把 colorPrimaryBorder 声明为必填 string，编译器就认为一定有值。
     *   该段与上游 skyroc 仓库完全一致，属上游遗留问题；本次迁移遵守「不改运行时逻辑」，
     *   原样保留并在此标注，后续如需修复应单独提交（例如改取 ...colorPalettes 里的同名键）。
     */
    // 选中态背景 = 主色描边色（暗色特调）
    colorPrimaryBg: colorMapToken.colorPrimaryBorder,
    // 选中态背景 hover = 主色描边 hover 色（同样来自上面那个并不存在的键）
    colorPrimaryBgHover: colorMapToken.colorPrimaryBorderHover,
  };
}
