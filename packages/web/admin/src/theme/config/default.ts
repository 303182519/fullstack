/** Theme scheme icons */
export const themeSchemeIcons: Record<'auto' | 'dark' | 'light', string> = {
  dark: 'material-symbols:nightlight-rounded',
  light: 'material-symbols:sunny',
  auto: 'material-symbols:hdr-auto'
};

/**
 * 后台默认主题配置。
 *
 * - 作为合并兜底：本地缓存（localStorage 的 `themeSettings`）缺字段时由本对象补齐（见 `utils/settings.ts` 的
 *   `mergeThemeSettings`）。
 * - 生产环境由 `setupTheme` 读取缓存后与本对象合并；开发环境直接使用本对象。
 * - 每个字段的权威类型与语义定义在 `theme/types/theme.d.ts`。
 */
export const defaultThemeSettings: Theme.ThemeSetting = {
  /** 主题模式：light 浅色 / dark 深色 / auto 跟随系统 */
  themeScheme: 'light',
  /** 灰度模式：开启后整页应用 `filter: grayscale(100%)`（见 `styles/global.css` 的 `html.grayscale`） */
  grayscale: false,
  /** 色弱模式：为色弱用户提供更易区分的视觉辅助 */
  colourWeakness: false,
  /** 是否启用「推荐颜色」能力（按主色推荐一套配色） */
  recommendColor: false,
  /** 主题主色（品牌色），对应 Ant Design 的 colorPrimary */
  themeColor: '#6366F1',
  /** 全局圆角基准值（px），用于派生圆角类 token */
  themeRadius: 6,
  /** 功能色：主色之外的语义色 */
  otherColor: {
    /** 信息色 */
    info: '#0EA5E9',
    /** 成功色 */
    success: '#10B981',
    /** 警告色 */
    warning: '#F59E0B',
    /** 错误色 */
    error: '#F43F5E'
  },
  /** info 色是否跟随主色：开启后 `info` 直接取 `themeColor`，忽略 `otherColor.info` */
  isInfoFollowPrimary: false,
  /** 全局基础字号（px），作用于根节点 font-size */
  themeTextSize: 14,
  /** 布局配置 */
  layout: {
    /**
     * 布局模式（六选一）：
     * - vertical：左侧完整垂直菜单
     * - horizontal：顶部水平菜单
     * - vertical-mix：左侧双栏，一级菜单栏 + 子级菜单栏
     * - vertical-hybrid-header-first：垂直布局，一级菜单放顶栏，子级菜单在左侧
     * - top-hybrid-sidebar-first：一级菜单在左侧侧栏，子级菜单在顶栏
     * - top-hybrid-header-first：一级菜单在顶栏，子级菜单在左侧
     */
    mode: 'vertical',
    /**
     * 内容区滚动模式：
     * - wrapper：外层容器滚动（整页滚动）
     * - content：仅内容区滚动（顶栏、侧栏保持固定）
     */
    scrollMode: 'content'
  },
  /** 页面切换效果 */
  page: {
    /** 是否开启页面切换动画 */
    animate: true,
    /**
     * 动画类型：
     * fade / fade-bottom / fade-scale / fade-slide / zoom-fade / zoom-out / none（关闭动画）
     */
    animateMode: 'fade-slide'
  },
  /** 顶栏配置 */
  header: {
    /** 顶栏高度（px） */
    height: 56,
    /** 面包屑 */
    breadcrumb: {
      /** 是否显示面包屑 */
      visible: true,
      /** 是否显示面包屑前的图标 */
      showIcon: true
    },
    /** 多语言切换入口 */
    multilingual: {
      /** 是否在顶栏显示多语言切换 */
      visible: true
    },
    /** 全局搜索入口 */
    globalSearch: {
      /** 是否在顶栏显示全局搜索 */
      visible: true
    }
  },
  /** 多页签（Tab）配置 */
  tab: {
    /** 是否显示页签栏 */
    visible: true,
    /** 是否持久化页签：开启后刷新页面会从本地存储恢复已打开的页签 */
    cache: true,
    /** 页签栏高度（px） */
    height: 44,
    /**
     * 页签样式：
     * - chrome：Chrome 浏览器风格
     * - button：按钮风格
     * - slider：滑块风格
     */
    mode: 'chrome',
    /** 是否允许鼠标中键关闭页签 */
    closeTabByMiddleClick: false
  },
  /** 顶栏与页签栏是否吸顶固定（内容滚动时保持可见） */
  fixedHeaderAndTab: true,
  /** 侧边栏配置 */
  sider: {
    /** 是否使用深色（反色）侧栏 */
    inverted: false,
    /** 普通模式（非 mix 类布局）侧栏展开宽度 */
    width: 220,
    /** 普通模式（非 mix 类布局）侧栏折叠宽度 */
    collapsedWidth: 64,
    /** mix 类布局（vertical-mix 等）一级菜单栏展开宽度 */
    mixWidth: 90,
    /** mix 类布局一级菜单栏折叠宽度 */
    mixCollapsedWidth: 64,
    /** mix 类布局中固定子菜单栏时追加的子栏宽度 */
    mixChildMenuWidth: 200,
    /** 进入带子菜单的一级菜单时，是否自动选中其第一个子菜单 */
    autoSelectFirstMenu: false
  },
  /** 页脚配置 */
  footer: {
    /** 是否显示页脚 */
    visible: true,
    /** 是否固定在视口底部 */
    fixed: false,
    /** 页脚高度（px） */
    height: 48,
    /** 顶栏混合布局下页脚是否靠右对齐（不占用侧栏宽度） */
    right: true
  },
  /** 水印配置（基于 Ant Design Watermark） */
  watermark: {
    /** 是否显示水印 */
    visible: false,
    /** 默认水印文案 */
    text: 'SkyrocAdmin',
    /** 是否启用自定义水印文案（使用上面的 text） */
    enableCustomText: true,
    /** 是否把当前用户名拼入水印内容 */
    enableUserName: false,
    /** 是否把当前时间拼入水印内容 */
    enableTime: false,
    /** 时间水印的格式（dayjs 格式串） */
    timeFormat: 'YYYY-MM-DD HH:mm',
    /** 透传给 Ant Design Watermark 的样式参数 */
    settings: {
      /** 字体设置 */
      font: {
        /** 字号（px） */
        fontSize: 16
      },
      /** 单个水印的高度 */
      height: 64,
      /** 水印相对画布的偏移量 [x, y] */
      offset: [12, 60],
      /** 水印旋转角度（负值表示逆时针） */
      rotate: -15,
      /** 单个水印的宽度 */
      width: 344,
      /** 水印层级 */
      zIndex: 9999
    }
  },
  /**
   * 主题 token：最终会转换为 CSS 变量。
   *
   * - light 为浅色模式 token（必填）。
   * - dark 为深色模式的覆盖项（可选，只需填写需要改动的项）。
   * - colors 中额外支持可选键 `nprogress`，用于覆盖顶部加载进度条颜色；不填时回落到主色。
   */
  tokens: {
    /** 浅色模式 token */
    light: {
      colors: {
        /** 容器类表面背景色（卡片、面板等） */
        container: 'rgb(255, 255, 255)',
        /** 页面整体布局背景色 */
        layout: 'rgb(247, 250, 252)',
        /** 反色区域背景色（如深色侧栏、反色面板） */
        inverted: 'rgb(0, 20, 40)',
        /** 基础文字颜色 */
        'base-text': 'rgb(31, 31, 31)'
      },
      boxShadow: {
        /** 顶栏投影 */
        header: '0 1px 2px rgb(0, 21, 41, 0.08)',
        /** 侧栏投影 */
        sider: '2px 0 8px 0 rgb(29, 35, 41, 0.05)',
        /** 页签栏投影 */
        tab: '0 1px 2px rgb(0, 21, 41, 0.08)'
      }
    },
    /** 深色模式 token（仅列出需要覆盖的项） */
    dark: {
      colors: {
        /** 容器类表面背景色 */
        container: 'rgb(28, 28, 28)',
        /** 页面整体布局背景色 */
        layout: 'rgb(18, 18, 18)',
        /** 基础文字颜色 */
        'base-text': 'rgb(224, 224, 224)'
      }
    }
  }
};
