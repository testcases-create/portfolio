import { describe, expect, it } from 'vitest';
import { hasTag, segments, strip } from './placeholders';

describe('segments', () => {
  it('returns plain text untouched', () => {
    expect(segments('Plain')).toEqual([{ kind: 'text', value: 'Plain' }]);
  });

  it('turns a trailing tag into a badge and drops the space before it', () => {
    expect(segments('190 ms [EDIT]')).toEqual([{ kind: 'text', value: '190 ms' }, { kind: 'edit' }]);
  });

  it('keeps one space after a badge in the middle of text', () => {
    expect(segments('Halden [EDIT] in Bengaluru')).toEqual([
      { kind: 'text', value: 'Halden' },
      { kind: 'edit' },
      { kind: 'text', value: ' in Bengaluru' },
    ]);
  });
});

it('keeps punctuation against the badge', () => {
  expect(segments('Computer Science [EDIT], Institution [EDIT].')).toEqual([
    { kind: 'text', value: 'Computer Science' },
    { kind: 'edit' },
    { kind: 'text', value: ', Institution' },
    { kind: 'edit' },
    { kind: 'text', value: '.' },
  ]);
});

describe('strip', () => {
  it('removes tags for attributes and URLs', () => {
    expect(strip('https://github.com/example [EDIT]')).toBe('https://github.com/example');
    expect(strip('Rhea [EDIT] Sander [EDIT]')).toBe('Rhea Sander');
  });

  it('detects tags', () => {
    expect(hasTag('x [EDIT]')).toBe(true);
    expect(hasTag('x')).toBe(false);
  });
});
