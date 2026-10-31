import type { ButtonTabProps } from '../../types';

import { cn } from '@fedstack/utils';

import { useTap } from './hook';
import styles from './index.module.css';

function SliderTab({
  active,
  children,
  className,
  darkMode,
  onClick,
  prefix,
  style,
  suffix,
  ...rest
}: ButtonTabProps) {
  const tap = useTap(onClick);

  return (
    <div
      {...rest}
      {...tap}
      className={cn(
        'relative inline-flex cursor-pointer items-center justify-center gap-6px whitespace-nowrap px-12px py-4px',
        [
          styles['slider-tab'],
          { [styles['slider-tab_dark']]: darkMode },
          { [styles['slider-tab_active']]: active },
          { [styles['slider-tab_active_dark']]: active && darkMode },
          className,
        ],
      )}
      style={{ ...style }}
      onClick={onClick}
    >
      {prefix}
      {children}
      {suffix}
    </div>
  );
}
export default SliderTab;
