import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG, readConfig } from './world-config';

describe('readConfig', () => {
  it('reads a page config', () => {
    expect(readConfig({ worldFormation: 'llm', worldMode: 'band' })).toEqual({
      formation: 'llm',
      mode: 'band',
    });
  });

  it('falls back to defaults for missing or unknown values', () => {
    expect(readConfig({})).toEqual(DEFAULT_CONFIG);
    expect(readConfig({ worldFormation: 'galaxy', worldMode: 'huge' })).toEqual(DEFAULT_CONFIG);
  });
});
