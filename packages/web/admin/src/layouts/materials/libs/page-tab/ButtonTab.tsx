import type { ButtonTabProps } from '../../types';

import { cn } from '@fedstack/utils';

import { useTap } from './hook';
import styles from './index.module.css';

function ButtonTab({
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
        'relative inline-flex cursor-pointer items-center justify-center gap-12px whitespace-nowrap border-(1px solid) rounded-4px px-12px py-4px',
        [
          styles['button-tab'],
          { [styles['button-tab_dark']]: darkMode },
          { [styles['button-tab_active']]: active },
          { [styles['button-tab_active_dark']]: active && darkMode },
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
export default ButtonTab;
