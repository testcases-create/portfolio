import { describe, expect, it } from 'vitest';
import { assembleProgress } from './intro-state';
import { parseColour, SETTINGS } from './theme';
import { formationIndex, scrollWeights } from './weights';

describe('scrollWeights', () => {
  it('starts on the first section and ends on the last', () => {
    expect(scrollWeights([0, 1, 2], [0, 0, 0])).toEqual([1, 0, 0, 0, 0]);
    expect(scrollWeights([0, 1, 2], [0, 1, 1])).toEqual([0, 0, 1, 0, 0]);
  });

  it('blends between neighbouring sections, and sums to 1', () => {
    const w = scrollWeights([0, 3], [0, 0.25]);
    expect(w).toEqual([0.75, 0, 0, 0.25, 0]);
    expect(w.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 9);
  });

  it('maps names to formations and falls back to data', () => {
    expect(formationIndex('llm')).toBe(2);
    expect(formationIndex('graph')).toBe(0);
    expect(formationIndex(undefined)).toBe(0);
  });
});

describe('parseColour', () => {
  it('reads hex and rgb() into linear RGB', () => {
    expect(parseColour('#ffffff')).toEqual([1, 1, 1]);
    expect(parseColour('#000')).toEqual([0, 0, 0]);
    const [r] = parseColour('rgb(128 0 0)');
    expect(r).toBeCloseTo(0.2158, 3); // sRGB 128 → linear
  });

  it('falls back to white for anything it cannot read', () => {
    expect(parseColour('var(--x)')).toEqual([1, 1, 1]);
  });

  it('gives the light theme its own blending and no bloom', () => {
    expect(SETTINGS.light.blending).toBe('normal');
    expect(SETTINGS.light.bloom).toBe(false);
    expect(SETTINGS.dark.blending).toBe('additive');
  });
});

describe('assembleProgress', () => {
  const root = (data: Record<string, string>) => ({ dataset: data }) as unknown as HTMLElement;

  it('is 1 with no intro, and when skipped', () => {
    expect(assembleProgress(root({}))).toBe(1);
    expect(assembleProgress(root({ introStart: '100', introSkip: '1' }), 200)).toBe(1);
  });

  it('eases from 0 to 1 over the intro', () => {
    const r = root({ introStart: '1000' });
    expect(assembleProgress(r, 1000)).toBe(0);
    expect(assembleProgress(r, 1000 + 1100)).toBeCloseTo(0.5, 9);
    expect(assembleProgress(r, 1000 + 5000)).toBe(1);
  });
});
