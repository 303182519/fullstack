import type { ClassValue } from 'clsx';
import type { ReactElement } from 'react';
import { cn } from '@fedstack/utils';
import { cloneElement } from 'react';

export type AnyProps = Record<string, any>;

export function mergeProps(slotProps: AnyProps, childProps: AnyProps): AnyProps {
  const overrideProps = { ...childProps };

  Object.keys(childProps).forEach((propName) => {
    const slotPropValue = slotProps[propName];
    const childPropValue = childProps[propName];

    const isHandler = /^on[A-Z]/.test(propName);

    if (isHandler) {
      if (slotPropValue && childPropValue) {
        overrideProps[propName] = (...args: unknown[]) => {
          const result = childPropValue(...args);
          slotPropValue(...args);
          return result;
        };
      }
      else if (slotPropValue) {
        overrideProps[propName] = slotPropValue;
      }
    }
    else if (propName === 'style') {
      overrideProps[propName] = { ...slotPropValue, ...childPropValue };
    }
    else if (propName === 'className') {
      overrideProps[propName] = [slotPropValue, childPropValue].filter(Boolean).join(' ');
    }
  });

  return { ...slotProps, ...overrideProps };
}

export function withClassName(element: ReactElement<any>, ...className: ClassValue[]): ReactElement<any> {
  return cloneElement(element, {
    ...element.props,
    className: cn(className, element.props.className),
  });
}
