import { describe, expect, it } from 'vitest';
import { POSES, approach, blendPose, fitDistance, orbitPosition } from './camera';
import { oneHot } from './sim.shared';

describe('camera rig', () => {
  it('returns a formation pose for a one-hot weight', () => {
    expect(blendPose(oneHot(3))).toEqual(POSES[3]);
  });

  it('blends poses linearly between formations', () => {
    const mid = blendPose([0.5, 0.5, 0, 0, 0]);
    expect(mid.azimuth).toBeCloseTo(((POSES[0]?.azimuth ?? 0) + (POSES[1]?.azimuth ?? 0)) / 2, 9);
  });

  it('fits wider formations further away, and narrower viewports further still', () => {
    expect(fitDistance(5, 35, 1.6)).toBeGreaterThan(fitDistance(3, 35, 1.6));
    expect(fitDistance(5, 35, 1.6, 0.5)).toBeGreaterThan(fitDistance(5, 35, 1.6, 1));
  });

  it('places the camera on a sphere around the target', () => {
    const p = orbitPosition([1, 2, 3], 10, 0.4, 0.3);
    expect(Math.hypot(p[0] - 1, p[1] - 2, p[2] - 3)).toBeCloseTo(10, 9);
  });

  it('eases independently of frame rate', () => {
    let a = 0;
    for (let i = 0; i < 60; i++) a = approach(a, 1, 1 / 60, 0.5);
    let b = 0;
    for (let i = 0; i < 30; i++) b = approach(b, 1, 1 / 30, 0.5);
    expect(a).toBeCloseTo(b, 9);
  });
});
