import { readFileSync } from 'node:fs';
import { format, resolveConfig } from 'prettier';
import { describe, expect, it } from 'vitest';
import { TOP_TEN, renderGuide } from './content-guide';

describe('CONTENT_GUIDE.md', () => {
  it('is up to date with the content (run npm run content-guide)', async () => {
    const options = (await resolveConfig('CONTENT_GUIDE.md')) ?? {};
    const expected = await format(renderGuide(), { ...options, parser: 'markdown' });
    expect(readFileSync('CONTENT_GUIDE.md', 'utf8')).toBe(expected);
  });

  it('names exactly ten items to fill first', () => {
    expect(TOP_TEN).toHaveLength(10);
  });
});
