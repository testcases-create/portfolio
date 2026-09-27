import { describe, expect, it } from 'vitest';
import {
  PARAMS,
  PRESETS,
  accuracy,
  batchGradient,
  initParams,
  meanLoss,
  predictGrid,
  preset,
  trainStep,
  type Point,
} from './logic';

function train(points: Point[], steps: number, seed = 1) {
  const p = initParams(seed);
  const v = new Float32Array(PARAMS);
  for (let i = 0; i < steps; i++) trainStep(p, v, points);
  return p;
}

describe('train a network', () => {
  it('computes the gradient that finite differences agree with', () => {
    const points = preset('circle').slice(0, 20);
    const p = initParams(4);
    const { grad } = batchGradient(p, points);
    const eps = 1e-3;
    for (const i of [0, 7, 17, 30, 70, 90, 100, 104]) {
      const up = Float64Array.from(p);
      const down = Float64Array.from(p);
      up[i] = (up[i] ?? 0) + eps;
      down[i] = (down[i] ?? 0) - eps;
      const numeric = (meanLoss(up, points) - meanLoss(down, points)) / (2 * eps);
      expect(grad[i], `parameter ${i}`).toBeCloseTo(numeric, 4);
    }
  });

  it('learns XOR, which no straight line can separate', () => {
    const points = preset('xor');
    expect(accuracy(initParams(1), points)).toBeLessThan(0.8);
    expect(accuracy(train(points, 1500), points)).toBeGreaterThan(0.95);
  });

  it('learns every preset well', () => {
    for (const name of PRESETS) {
      const points = preset(name);
      const steps = name === 'spiral' ? 5000 : 1500;
      expect(accuracy(train(points, steps), points), name).toBeGreaterThan(name === 'spiral' ? 0.85 : 0.95);
    }
  });

  it('lowers the loss as it trains', () => {
    const points = preset('circle');
    const before = meanLoss(initParams(1), points);
    expect(meanLoss(train(points, 300), points)).toBeLessThan(before * 0.6);
  });

  it('is reproducible for a seed, and does nothing with no points', () => {
    expect(train(preset('xor'), 50, 9)).toEqual(train(preset('xor'), 50, 9));
    const p = initParams(2);
    const copy = p.slice();
    trainStep(p, new Float32Array(PARAMS), []);
    expect(p).toEqual(copy);
  });

  it('predicts a grid of probabilities, top row first', () => {
    const points = preset('clusters');
    const p = train(points, 800);
    const grid = predictGrid(p, 8);
    expect(grid).toHaveLength(64);
    // Class A sits top left, class B bottom right.
    expect(grid[0]).toBeGreaterThan(0.8);
    expect(grid[63]).toBeLessThan(0.2);
  });
});
