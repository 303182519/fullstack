import type { FC, MouseEvent, TouchEvent } from 'react';
import type { ButtonTabProps } from '../../types';
import { cn } from '@fedstack/utils';

import { memo } from 'react';

import ButtonTab from './ButtonTab';
import ChromeTab from './ChromeTab';
import styles from './index.module.css';
import { ACTIVE_COLOR, createTabCssVars } from './shared';
import SliderTab from './SliderTab';
import SvgClose from './SvgClose';

type PageTabProps = Omit<ButtonTabProps, 'onMouseUp'>;

const PageTab: FC<PageTabProps> = ({
  active,
  activeColor = ACTIVE_COLOR,
  buttonClass,
  children,
  chromeClass,
  className,
  closable = true,
  darkMode,
  handleClose,
  mode = 'chrome',
  prefix,
  sliderClass,
  style,
  suffix,
  ...rest
}) => {
  const cssVars = createTabCssVars(activeColor);

  const getActiveTabComponent = {
    button: {
      class: buttonClass,
      component: ButtonTab,
    },
    chrome: {
      class: chromeClass,
      component: ChromeTab,
    },
    slider: {
      class: sliderClass,
      component: SliderTab,
    },
  };

  const ActiveTabComponent = getActiveTabComponent[mode].component;

  const activeClass = getActiveTabComponent[mode].class;

  function closeTab(event: MouseEvent | TouchEvent) {
    event.stopPropagation();
    if (handleClose)
      handleClose();
  }

  const suffixComponent
    = suffix
      || (closable && (
        <SvgClose
          className={styles['svg-close']}
          onClick={closeTab}
        />
      ));

  return (
    <ActiveTabComponent
      active={active}
      className={cn(activeClass, className)}
      darkMode={darkMode}
      prefix={prefix}
      style={{ ...cssVars, ...style }}
      suffix={suffixComponent}
      {...rest}
    >
      {children}
    </ActiveTabComponent>
  );
};

export default memo(PageTab);
