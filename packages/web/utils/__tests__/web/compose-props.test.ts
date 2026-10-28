import { createElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { mergeProps, withClassName } from '../../src/compose-props';

describe('mergeProps', () => {
  it('composes child and slot event handlers while preserving the child result', () => {
    const calls: string[] = [];
    const childClick = vi.fn(() => {
      calls.push('child');
      return 'child-result';
    });
    const slotClick = vi.fn(() => {
      calls.push('slot');
    });

    const props = mergeProps({ id: 'slot', onClick: slotClick }, { id: 'child', onClick: childClick });

    expect(props.onClick('event')).toBe('child-result');
    expect(calls).toEqual(['child', 'slot']);
    expect(props.id).toBe('child');
  });

  it('uses the slot event handler when the child handler is absent', () => {
    const slotFocus = vi.fn();
    const props = mergeProps({ onFocus: slotFocus }, { onFocus: undefined });

    props.onFocus();

    expect(slotFocus).toHaveBeenCalledTimes(1);
  });

  it('leaves an absent handler unset when neither side provides one', () => {
    expect(mergeProps({}, { onFocus: undefined })).toEqual({ onFocus: undefined });
  });

  it('merges style and className props with child props taking priority', () => {
    expect(
      mergeProps(
        { className: 'slot-class', style: { color: 'red', padding: 4 }, title: 'slot' },
        { className: 'child-class', style: { padding: 8 } },
      ),
    ).toEqual({
      className: 'slot-class child-class',
      style: { color: 'red', padding: 8 },
      title: 'slot',
    });
  });
});

describe('withClassName', () => {
  it('clones an element and appends class names through cn', () => {
    const element = createElement('button', { className: 'inline-flex' });
    const next = withClassName(element, 'text-sm', false, 'font-medium');

    expect(next).not.toBe(element);
    expect(next.props.className).toBe('text-sm font-medium inline-flex');
  });
});
