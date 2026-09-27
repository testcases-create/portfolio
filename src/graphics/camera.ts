// The camera rig (PLAN.md 12, note 2). Each formation has a pose; the rig
// blends poses by the same weights that blend the particles, so the camera
// dollies and orbits as the world changes shape. A slow drift and pointer
// parallax keep the depth readable. Pure functions: the engine applies them.
import { K } from './formations';

export interface Pose {
  /** Point the camera looks at. */
  target: [number, number, number];
  /** Radius that must fit in view. */
  radius: number;
  /** Radians around y, and above the horizon. */
  azimuth: number;
  elevation: number;
}

/** Data, AI/ML, LLM, SDE, Converge. Angled views show the depth in each shape. */
export const POSES: Pose[] = [
  { target: [0, 0, 0], radius: 5.2, azimuth: 0.1, elevation: 0.12 },
  { target: [0, 0, 0], radius: 5.2, azimuth: -0.5, elevation: 0.26 },
  { target: [0, 0.25, 0.4], radius: 5.1, azimuth: 0.18, elevation: 0.3 },
  { target: [-0.3, 0, 0], radius: 5.3, azimuth: 0.5, elevation: 0.38 },
  { target: [0, 0, 0], radius: 3.8, azimuth: 0.22, elevation: 0.3 },
];

export function blendPose(weights: readonly number[]): Pose {
  const out: Pose = { target: [0, 0, 0], radius: 0, azimuth: 0, elevation: 0 };
  let total = 0;
  for (let k = 0; k < K; k++) {
    const w = weights[k] ?? 0;
    const p = POSES[k] as Pose;
    total += w;
    out.target[0] += p.target[0] * w;
    out.target[1] += p.target[1] * w;
    out.target[2] += p.target[2] * w;
    out.radius += p.radius * w;
    out.azimuth += p.azimuth * w;
    out.elevation += p.elevation * w;
  }
  if (total <= 0) return { ...(POSES[0] as Pose), target: [...(POSES[0] as Pose).target] };
  out.target = out.target.map((v) => v / total) as [number, number, number];
  out.radius /= total;
  out.azimuth /= total;
  out.elevation /= total;
  return out;
}

/** Slow idle orbit, so a still page still shows depth. Radians. */
export const drift = (time: number) => ({
  azimuth: 0.07 * Math.sin(time * 0.07),
  elevation: 0.035 * Math.sin(time * 0.05 + 1.3),
});

/** Pointer in [-1, 1]² → small orbit offsets. */
export const parallax = (px: number, py: number) => ({ azimuth: px * 0.09, elevation: -py * 0.05 });

/**
 * Distance that fits a sphere of `radius` into the given share of the view.
 * `spanX` and `spanY` are the fractions of the viewport width and height
 * available: wide screens compose into the band right of the text column, and
 * narrow screens into a window between blocks of text.
 */
export function fitDistance(
  radius: number,
  fovDeg: number,
  aspect: number,
  spanX = 1,
  fill = 0.85,
  spanY = 1,
): number {
  const tanV = Math.tan((fovDeg * Math.PI) / 360);
  const tanH = tanV * aspect * spanX;
  return Math.max(radius / (tanV * spanY * fill), radius / (tanH * fill));
}

/** Camera position on a sphere around the target. */
export function orbitPosition(
  target: readonly [number, number, number],
  distance: number,
  azimuth: number,
  elevation: number,
): [number, number, number] {
  const ce = Math.cos(elevation);
  return [
    target[0] + distance * ce * Math.sin(azimuth),
    target[1] + distance * Math.sin(elevation),
    target[2] + distance * ce * Math.cos(azimuth),
  ];
}

/** Exponential approach: frame-rate independent easing toward a value. */
export const approach = (current: number, target: number, dt: number, tau: number) =>
  current + (target - current) * (1 - Math.exp(-dt / tau));
