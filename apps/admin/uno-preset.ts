import type { Preset, PresetWind3Theme, Rule, UserShortcuts } from 'unocss';

/**
 * UnoCSS 预设：与 skyroc `@skyroc/uno-config` 的 `presetSoybeanAdmin` 对齐。
 */

/** 主题色键（与 skyroc 保持一致） */
const themeColorKeys = [
  'primary',
  'info',
  'success',
  'warning',
  'error',
  'blue',
  'purple',
  'cyan',
  'green',
  'magenta',
  'pink',
  'red',
  'orange',
  'yellow',
  'volcano',
  'geekblue',
  'gold',
  'lime',
] as const;

/** 色板档位（Tailwind 风格 50~950） */
const colorPaletteNumbers = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950] as const;

function buildAntdMainPalette(name: string) {
  return {
    50: `var(--${name}-50)`,
    100: `var(--${name}-100)`,
    200: `var(--${name}-200)`,
    300: `var(--${name}-300)`,
    400: `var(--${name}-400)`,
    500: `var(--${name}-500)`,
    600: `var(--${name}-600)`,
    700: `var(--${name}-700)`,
    800: `var(--${name}-800)`,
    900: `var(--${name}-900)`,
    950: `var(--${name}-950)`,
  };
}

/**
 * 单个色系的色板 + 语义别名。
 *
 * 档位语义（亮色语境）：50-200 浅底 / 300-400 过渡 / 500 主色 / 600-700 深色 / 800-950 极深。
 */
function createColorsPalette(name: string) {
  const colors = buildAntdMainPalette(name);
  return {
    ...colors,
    'DEFAULT': `var(--${name})`,

    'bg': `var(--${name}-50)`,
    'bg-hover': `var(--${name}-100)`,

    'border': `var(--${name}-200)`,
    'border-hover': `var(--${name}-300)`,

    'hover': `var(--${name}-400)`,
    'active': `var(--${name}-600)`,

    'lightest': `var(--${name}-50)`,
    'lighter': `var(--${name}-100)`,
    'light': `var(--${name}-200)`,

    'text': `var(--${name}-500)`,
    'text-hover': `var(--${name}-400)`,
    'text-active': `var(--${name}-700)`,
  };
}

function createColorPaletteVars() {
  const colorPaletteVar: Record<string, Record<string, string>> = {};
  themeColorKeys.forEach((color) => {
    colorPaletteVar[color] = createColorsPalette(color);
  });
  return colorPaletteVar;
}

const colorPaletteVars = createColorPaletteVars();

/** 文字语义变体（`text-<variant>` 取色，与字号工具类同名时以取色为准，与上游一致） */
const textVariants = [
  'base',
  'secondary',
  'tertiary',
  'quaternary',
  'placeholder',
  'disabled',
  'heading',
  'label',
  'description',
  'light-solid',
];

const radiusVariants = ['DEFAULT', 'none', 'xs', 'sm', 'md', 'lg', 'xl', '2xl', '3xl', '4xl', 'full'] as const;

/** `radius-*` 圆角工具类 */
const radiusVariantsRules = radiusVariants.map((variant) => {
  if (variant === 'md' || variant === 'DEFAULT') {
    return [`radius-${variant}`, { 'border-radius': 'var(--radius)' }];
  }
  if (variant === 'none') {
    return [`radius-${variant}`, { 'border-radius': 0 }];
  }
  return [`radius-${variant}`, { 'border-radius': `var(--radius-${variant})` }];
}) as Rule[];

const textVariantsRules = textVariants.map((variant) => {
  if (variant === 'base') {
    return [`text-${variant}`, { color: 'var(--color-text)' }];
  }
  return [`text-${variant}`, { color: `var(--color-text-${variant})` }];
}) as Rule[];

/** Flex / 定位 / 文本 / 卡片快捷类（与 skyroc `shortcuts.ts` 一致） */
const allShortcuts: UserShortcuts = [
  {
    'flex-1-hidden': 'flex-1 overflow-hidden',
    'flex-center': 'flex justify-center items-center',
    'flex-col': 'flex flex-col',
    'flex-col-center': 'flex-center flex-col',
    'flex-col-stretch': 'flex-col items-stretch',
    'flex-x-center': 'flex justify-center',
    'flex-y-center': 'flex items-center',
    'i-flex-center': 'inline-flex justify-center items-center',
    'i-flex-col': 'flex-col inline-flex',
    'i-flex-col-center': 'flex-col i-flex-center',
    'i-flex-col-stretch': 'i-flex-col items-stretch',
    'i-flex-x-center': 'inline-flex justify-center',
    'i-flex-y-center': 'inline-flex items-center',
  },
  {
    'absolute-bl': 'absolute-lb',
    'absolute-br': 'absolute-rb',
    'absolute-center': 'absolute-lt flex-center size-full',
    'absolute-lb': 'absolute left-0 bottom-0',
    'absolute-lt': 'absolute left-0 top-0',
    'absolute-rb': 'absolute right-0 bottom-0',
    'absolute-rt': 'absolute right-0 top-0',
    'absolute-tl': 'absolute-lt',
    'absolute-tr': 'absolute-rt',
    'fixed-bl': 'fixed-lb',
    'fixed-br': 'fixed-rb',
    'fixed-center': 'fixed-lt flex-center size-full',
    'fixed-lb': 'fixed left-0 bottom-0',
    'fixed-lt': 'fixed left-0 top-0',
    'fixed-rb': 'fixed right-0 bottom-0',
    'fixed-rt': 'fixed right-0 top-0',
    'fixed-tl': 'fixed-lt',
    'fixed-tr': 'fixed-rt',
  },
  {
    'ellipsis-text': 'nowrap-hidden text-ellipsis',
    'nowrap-hidden': 'overflow-hidden whitespace-nowrap',
  },
  {
    'card-wrapper': 'rd-8px shadow-sm',
    'card': 'bg-container rounded-xl shadow-md gap-2xs flex-col items-stretch px-md py-md',
    'card-sm': 'bg-container rounded-lg shadow-md gap-xs flex-col items-stretch px-xs py-xs',
    'card-lg': 'bg-container rounded-2xl shadow-md gap-xl flex-col items-stretch px-xl py-xl',
  },
];

/** 字号 / 行高：`--text-*` / `--line-height-*` 由主题运行时写入 */
const fontSize: Record<string, [string, string]> = {
  'xs': ['var(--text-xs)', 'var(--line-height-xs)'],
  'sm': ['var(--text-sm)', 'var(--line-height-sm)'],
  'md': ['var(--text-base)', 'var(--line-height-base)'],
  'lg': ['var(--text-lg)', 'var(--line-height-lg)'],
  'xl': ['var(--text-xl)', 'var(--line-height-xl)'],
  '2xl': ['var(--text-2xl)', 'var(--line-height-2xl)'],
  '3xl': ['var(--text-3xl)', 'var(--line-height-3xl)'],
  '4xl': ['var(--text-4xl)', 'var(--line-height-4xl)'],
  '5xl': ['var(--text-5xl)', 'var(--line-height-5xl)'],
  '6xl': ['var(--text-6xl)', 'var(--line-height-6xl)'],
  '7xl': ['var(--text-7xl)', 'var(--line-height-7xl)'],
  '8xl': ['var(--text-8xl)', 'var(--line-height-8xl)'],
  '9xl': ['var(--text-9xl)', 'var(--line-height-9xl)'],
};

const sizeScale = {
  'DEFAULT': '0.25rem',
  '3xs': '0.25rem',
  '2xs': '0.5rem',
  'xs': '0.75rem',
  'md': '1rem',
  'lg': '1.25rem',
  'xl': '1.5rem',
  '2xl': '2rem',
  '3xl': '2.5rem',
  '4xl': '3rem',
  '5xl': '4rem',
  '6xl': '5rem',
  '7xl': '6rem',
  '8xl': '8rem',
  '9xl': '9rem',
};

/**
 * admin 主题预设。
 *
 * preflights：shadcn 折叠动画 keyframes + `html.size-*` 字号档位（主题设置里的「字体大小」）。
 */
export function presetAdminTheme(): Preset<PresetWind3Theme> {
  return {
    name: 'unocss-preset-fedstack-admin',
    preflights: [
      {
        getCSS: () => `
          @keyframes shadcn-down { from{ height: 0 } to { height: var(--radix-accordion-content-height)} }
          @keyframes shadcn-up { from{ height: var(--radix-accordion-content-height)} to { height: 0 } }
          @keyframes shadcn-collapsible-down { from{ height: 0 } to { height: var(--radix-collapsible-content-height)} }
          @keyframes shadcn-collapsible-up { from{ height: var(--radix-collapsible-content-height)} to { height: 0 } }
          @keyframes enter-x-animation { to { opacity: 1; transform: translateX(0); } }
          @keyframes enter-y-animation { to { opacity: 1; transform: translateY(0); } }
        `,
      },
      {
        getCSS: () => `
          html.size-xs { font-size: 12px; }
          html.size-sm { font-size: 14px; }
          html.size-md { font-size: 16px; }
          html.size-lg { font-size: 18px; }
          html.size-xl { font-size: 20px; }
          html.size-2xl { font-size: 24px; }
        `,
      },
    ],
    shortcuts: allShortcuts,
    rules: [
      ...textVariantsRules,
      ...radiusVariantsRules,
      ['radius', { 'border-radius': 'var(--border-radius)' }],
      ['animate-accordion-down', { animation: 'shadcn-down 0.2s ease-out' }],
      ['animate-accordion-up', { animation: 'shadcn-up 0.2s ease-out' }],
      ['animate-collapsible-down', { animation: 'shadcn-collapsible-down 0.2s ease-out' }],
      ['animate-collapsible-up', { animation: 'shadcn-collapsible-up 0.2s ease-out' }],
      [
        /^enter-x:nth-child\((\d+)\)$/,
        ([, n]) => ({
          animation: `enter-x-animation 0.3s ease-in-out ${0.1 * Number(n)}s forwards`,
          opacity: '0',
          transform: 'translateX(50px)',
        }),
      ],
      [
        /^enter-y:nth-child\((\d+)\)$/,
        ([, n]) => ({
          animation: `enter-y-animation 0.3s ease-in-out ${0.1 * Number(n)}s forwards`,
          opacity: '0',
          transform: 'translateY(50px)',
        }),
      ],
      [
        /^-enter-x:nth-child\((\d+)\)$/,
        ([, n]) => ({
          animation: `enter-x-animation 0.3s ease-in-out ${0.1 * Number(n)}s forwards`,
          opacity: '0',
          transform: 'translateX(-50px)',
        }),
      ],
      [
        /^-enter-y:nth-child\((\d+)\)$/,
        ([, n]) => ({
          animation: `enter-y-animation 0.3s ease-in-out ${0.1 * Number(n)}s forwards`,
          opacity: '0',
          transform: 'translateY(-50px)',
        }),
      ],
    ],
    theme: {
      colors: {
        ...colorPaletteVars,
        'base-text': 'var(--color-text-base)',
        'base-bg': 'var(--color-bg-base)',
        'mask': 'var(--color-bg-mask)',
        'link': {
          DEFAULT: 'var(--color-link)',
          hover: 'var(--color-link-hover)',
          active: 'var(--color-link-active)',
        },
        'border': {
          DEFAULT: 'var(--color-border)',
          secondary: 'var(--color-border-secondary)',
          disabled: 'var(--color-border-disabled)',
        },
        'container': {
          DEFAULT: 'var(--color-bg-container)',
          disabled: 'var(--color-bg-container-disabled)',
        },
        'blur': 'var(--color-bg-blur)',
        'inverted': 'var(--color-inverted)',
        'layout': 'var(--color-bg-layout)',
        'nprogress': 'var(--color-nprogress)',
      },
      fontSize,
      lineHeight: {
        'xs': '1.125rem',
        'sm': '1.375rem',
        'base': '1.5rem',
        'lg': '1.625rem',
        'xl': '1.75rem',
        '2xl': '2rem',
        '3xl': '2.375rem',
        '4xl': '2.75rem',
        '5xl': '3.5rem',
        '6xl': '4.25rem',
        '7xl': '5rem',
        '8xl': '6.5rem',
        '9xl': '8.5rem',
      },
      width: sizeScale,
      height: sizeScale,
      maxWidth: sizeScale,
      maxHeight: sizeScale,
      minWidth: sizeScale,
      minHeight: sizeScale,
      spacing: sizeScale,
      borderRadius: {
        'DEFAULT': '0.375rem',
        'none': '0',
        'xs': '0.125rem',
        'sm': '0.25rem',
        'md': '0.375rem',
        'lg': '0.5rem',
        'xl': '0.75rem',
        '2xl': '1rem',
        '3xl': '1.5rem',
        '4xl': '2rem',
        'full': '9999px',
      },
      boxShadow: {
        float: `0 6px 16px 0 rgb(0 0 0 / 8%),
          0 3px 6px -4px rgb(0 0 0 / 12%),
          0 9px 28px 8px rgb(0 0 0 / 5%)`,
        header: 'var(--header-box-shadow)',
        sider: 'var(--sider-box-shadow)',
        tab: 'var(--tab-box-shadow)',
      },
    },
  };
}

export { colorPaletteNumbers, colorPaletteVars, themeColorKeys };
