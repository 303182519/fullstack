import type { CSSProperties } from 'react';
import { icons as mdiIcons } from '@iconify-json/mdi';
import { addCollection, Icon } from '@iconify/react';

// 模块加载时注册 Material Design Icons 全集。
// addCollection 内部会去重，多次调用安全；mdi 是壳包默认图标集，
// 所有 SvgIcon 消费者（admin-header / menus / breadcrumb 等）均可直接使用
// "mdi:xxx" 格式的图标名而无需额外注册，也不会触发 Iconify API 在线请求。
addCollection(mdiIcons);

interface Props {
  readonly className?: string;
  /** Iconify icon name（如 "mdi:shield-account"） */
  readonly icon?: string | null;
  /** Local svg icon name */
  readonly localIcon?: string | null;
  /** Local icon prefix (default: 'icon-local') */
  readonly localIconPrefix?: string;
  readonly style?: CSSProperties;
}

const defaultLocalIcon = 'no-icon';
function symbolId(localIconPrefix: string, localIcon: string | null = defaultLocalIcon) {
  const iconName = localIcon || defaultLocalIcon;

  return `#${localIconPrefix}-${iconName}`;
}

/**
 * Props
 *
 * - Support iconify and local svg icon
 * - If icon and localIcon are passed at the same time, localIcon will be rendered first
 */
function SvgIcon({ icon, localIcon, localIconPrefix = 'icon-local', ...props }: Props) {
  /** If localIcon is passed, render localIcon first */
  return localIcon || !icon
    ? (
        <svg
          height="1em"
          width="1em"
          {...props}
          aria-hidden="true"
        >
          <use
            fill="currentColor"
            href={symbolId(localIconPrefix, localIcon)}
          />
        </svg>
      )
    : (
        <Icon
          icon={icon}
          {...props}
        />
      );
}

export default SvgIcon;
