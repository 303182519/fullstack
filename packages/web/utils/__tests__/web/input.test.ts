import { describe, expect, it } from 'vitest';
import { getEventValue, isCheckBoxInput, isFileInput, isRadioInput } from '../../src/input';

describe('input guards', () => {
  it('checks checkbox, radio, and file input types', () => {
    const checkbox = document.createElement('input');
    const file = document.createElement('input');
    const radio = document.createElement('input');

    checkbox.type = 'checkbox';
    file.type = 'file';
    radio.type = 'radio';

    expect(isCheckBoxInput(checkbox)).toBe(true);
    expect(isCheckBoxInput(radio)).toBe(false);
    expect(isFileInput(file)).toBe(true);
    expect(isRadioInput(radio)).toBe(true);
  });
});

describe('getEventValue', () => {
  it('returns the raw value when the first argument is not an event object', () => {
    expect(getEventValue('value', 'raw')).toBe('raw');
  });

  it('returns the event object when it has no target', () => {
    const event = {};

    expect(getEventValue('value', event)).toBe(event);
  });

  it('returns checked for checkbox targets', () => {
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = true;

    expect(getEventValue('value', { target: checkbox })).toBe(true);
  });

  it('reads the requested value prop from non-checkbox targets', () => {
    expect(getEventValue('selected', { target: { selected: 'item-1', type: 'select' } })).toBe('item-1');
  });
});
