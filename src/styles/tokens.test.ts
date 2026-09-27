import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { check, palette } from '../../scripts/palette.mjs';
import { KEYS } from '../lib/preferences';

const css = readFileSync('src/styles/tokens.css', 'utf8');
const block = (selector: string) => {
  const start = css.indexOf(`${selector} {`);
  return css.slice(start, css.indexOf('}', start));
};
// CSS names are kebab-case (--sde-ink); palette keys are camelCase (sdeInk).
const camel = (name = '') => name.replace(/-(\w)/g, (_, c: string) => c.toUpperCase());
const tokens = (text: string) =>
  Object.fromEntries(
    [...text.matchAll(/--([\w-]+):\s*(#[0-9a-f]{6})/gi)].map(([, k, v]) => [camel(k), v?.toUpperCase()]),
  );

describe('design tokens', () => {
  it.each(['dark', 'light'] as const)('%s theme matches the checked palette', (theme) => {
    const expected = palette[theme] as Record<string, string>;
    expect(tokens(block(`:root[data-theme='${theme}']`))).toEqual(expected);
  });

  it('passes contrast and colour-vision checks', () => {
    expect(check().failures).toEqual([]);
  });

  it('the pre-paint theme script reads the same storage key as boot code', () => {
    expect(readFileSync('src/layouts/Base.astro', 'utf8')).toContain(`localStorage.getItem('${KEYS.theme}')`);
  });
});
