import { describe, expect, it } from 'vitest';
import { curl } from './curl';

describe('curl field', () => {
  it('is divergence-free (numerically)', () => {
    const h = 1e-4;
    const at = (x: number, y: number, z: number) => {
      const o = [0, 0, 0];
      curl(x, y, z, 0.7, o);
      return o;
    };
    for (const [x, y, z] of [
      [0.1, 0.2, 0.3],
      [-1.4, 0.9, 2.2],
      [3, -2, 0.5],
    ] as const) {
      const div =
        ((at(x + h, y, z)[0] ?? 0) - (at(x - h, y, z)[0] ?? 0)) / (2 * h) +
        ((at(x, y + h, z)[1] ?? 0) - (at(x, y - h, z)[1] ?? 0)) / (2 * h) +
        ((at(x, y, z + h)[2] ?? 0) - (at(x, y, z - h)[2] ?? 0)) / (2 * h);
      const scale = Math.hypot(...at(x, y, z));
      expect(Math.abs(div)).toBeLessThan(1e-5 * Math.max(1, scale));
    }
  });

  it('is not trivially zero', () => {
    const o = [0, 0, 0];
    curl(0.3, 0.1, -0.2, 0, o);
    expect(Math.hypot(...o)).toBeGreaterThan(0.1);
  });
});
