// "Train a network in your browser" (BRIEF.md 5, the Lab): a small multilayer
// perceptron, 2 inputs → 8 → 8 → 1 output, tanh hidden layers and a sigmoid
// output, trained on the visitor's points with full-batch gradient descent and
// momentum on binary cross-entropy. This file is the CPU trainer and the
// specification the WebGPU kernel (train-gpu.ts) must match; a Playwright test runs
// both from the same start and compares the weights.

export const LAYERS = [2, 8, 8, 1] as const;
/** Parameter layout in one flat array: W1 (8×2), b1, W2 (8×8), b2, W3 (1×8), b3. */
export const OFFSETS = { w1: 0, b1: 16, w2: 24, b2: 88, w3: 96, b3: 104 } as const;
export const PARAMS = 105;
export const MAX_POINTS = 256;
export const LEARNING_RATE = 0.12;
export const MOMENTUM = 0.9;

export interface Point {
  x: number;
  y: number;
  /** 1 for class A, 0 for class B. */
  label: 0 | 1;
}

export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Xavier-style uniform initialisation, seeded so a reset is reproducible. */
export function initParams(seed = 1): Float32Array {
  const r = mulberry32(seed);
  const p = new Float32Array(PARAMS);
  const fill = (off: number, count: number, fanIn: number, fanOut: number) => {
    const limit = Math.sqrt(6 / (fanIn + fanOut));
    for (let i = 0; i < count; i++) p[off + i] = (r() * 2 - 1) * limit;
  };
  fill(OFFSETS.w1, 16, 2, 8);
  fill(OFFSETS.w2, 64, 8, 8);
  fill(OFFSETS.w3, 8, 8, 1);
  return p;
}

export interface Activations {
  h1: number[];
  h2: number[];
  out: number;
}

const sigmoid = (z: number) => 1 / (1 + Math.exp(-z));

export function forward(p: ArrayLike<number>, x: number, y: number): Activations {
  const w = (i: number) => p[i] ?? 0;
  const h1 = Array.from({ length: 8 }, (_, j) =>
    Math.tanh(w(OFFSETS.w1 + j * 2) * x + w(OFFSETS.w1 + j * 2 + 1) * y + w(OFFSETS.b1 + j)),
  );
  const h2 = Array.from({ length: 8 }, (_, j) => {
    let z = w(OFFSETS.b2 + j);
    for (let k = 0; k < 8; k++) z += w(OFFSETS.w2 + j * 8 + k) * (h1[k] ?? 0);
    return Math.tanh(z);
  });
  let z = w(OFFSETS.b3);
  for (let k = 0; k < 8; k++) z += w(OFFSETS.w3 + k) * (h2[k] ?? 0);
  return { h1, h2, out: sigmoid(z) };
}

/** One sample's gradient of the cross-entropy loss, added into `grad`. */
export function sampleGradient(p: ArrayLike<number>, pt: Point, grad: Float64Array | Float32Array): number {
  const w = (i: number) => p[i] ?? 0;
  const { h1, h2, out } = forward(p, pt.x, pt.y);
  // Sigmoid + cross-entropy: dL/dz at the output is simply (prediction − label).
  const d3 = out - pt.label;
  grad[OFFSETS.b3] = (grad[OFFSETS.b3] ?? 0) + d3;
  const d2: number[] = [];
  for (let j = 0; j < 8; j++) {
    grad[OFFSETS.w3 + j] = (grad[OFFSETS.w3 + j] ?? 0) + d3 * (h2[j] ?? 0);
    d2[j] = d3 * w(OFFSETS.w3 + j) * (1 - (h2[j] ?? 0) ** 2);
  }
  const d1 = new Array<number>(8).fill(0);
  for (let j = 0; j < 8; j++) {
    const dj = d2[j] ?? 0;
    grad[OFFSETS.b2 + j] = (grad[OFFSETS.b2 + j] ?? 0) + dj;
    for (let k = 0; k < 8; k++) {
      grad[OFFSETS.w2 + j * 8 + k] = (grad[OFFSETS.w2 + j * 8 + k] ?? 0) + dj * (h1[k] ?? 0);
      d1[k] = (d1[k] ?? 0) + dj * w(OFFSETS.w2 + j * 8 + k);
    }
  }
  for (let k = 0; k < 8; k++) {
    const dk = (d1[k] ?? 0) * (1 - (h1[k] ?? 0) ** 2);
    grad[OFFSETS.b1 + k] = (grad[OFFSETS.b1 + k] ?? 0) + dk;
    grad[OFFSETS.w1 + k * 2] = (grad[OFFSETS.w1 + k * 2] ?? 0) + dk * pt.x;
    grad[OFFSETS.w1 + k * 2 + 1] = (grad[OFFSETS.w1 + k * 2 + 1] ?? 0) + dk * pt.y;
  }
  const o = Math.min(1 - 1e-7, Math.max(1e-7, out));
  return -(pt.label * Math.log(o) + (1 - pt.label) * Math.log(1 - o));
}

/** Mean loss and mean gradient over all points. */
export function batchGradient(p: ArrayLike<number>, points: readonly Point[]) {
  const grad = new Float64Array(PARAMS);
  let loss = 0;
  for (const pt of points) loss += sampleGradient(p, pt, grad);
  const n = Math.max(1, points.length);
  for (let i = 0; i < PARAMS; i++) grad[i] = (grad[i] ?? 0) / n;
  return { loss: loss / n, grad };
}

/** One step of gradient descent with momentum, in place. The GPU kernel does exactly this. */
export function trainStep(p: Float32Array, velocity: Float32Array, points: readonly Point[]): number {
  if (!points.length) return 0;
  const { loss, grad } = batchGradient(p, points);
  for (let i = 0; i < PARAMS; i++) {
    velocity[i] = MOMENTUM * (velocity[i] ?? 0) - LEARNING_RATE * (grad[i] ?? 0);
    p[i] = (p[i] ?? 0) + (velocity[i] ?? 0);
  }
  return loss;
}

export function accuracy(p: ArrayLike<number>, points: readonly Point[]): number {
  if (!points.length) return 0;
  let right = 0;
  for (const pt of points) if (forward(p, pt.x, pt.y).out >= 0.5 === (pt.label === 1)) right++;
  return right / points.length;
}

export function meanLoss(p: ArrayLike<number>, points: readonly Point[]): number {
  if (!points.length) return 0;
  let loss = 0;
  for (const pt of points) {
    const o = Math.min(1 - 1e-7, Math.max(1e-7, forward(p, pt.x, pt.y).out));
    loss += -(pt.label * Math.log(o) + (1 - pt.label) * Math.log(1 - o));
  }
  return loss / points.length;
}

/** Predictions on a res × res grid over [-1, 1]², row by row from the top. */
export function predictGrid(
  p: ArrayLike<number>,
  res: number,
  out = new Float32Array(res * res),
): Float32Array {
  for (let r = 0; r < res; r++) {
    const y = 1 - ((r + 0.5) / res) * 2;
    for (let c = 0; c < res; c++) out[r * res + c] = forward(p, ((c + 0.5) / res) * 2 - 1, y).out;
  }
  return out;
}

export const PRESETS = ['clusters', 'xor', 'circle', 'spiral'] as const;
export type Preset = (typeof PRESETS)[number];

/** Example datasets in [-1, 1]², seeded. */
export function preset(name: Preset, seed = 3): Point[] {
  const r = mulberry32(seed);
  const g = () => Math.sqrt(-2 * Math.log(r() + 1e-9)) * Math.cos(2 * Math.PI * r());
  const clamp = (v: number) => Math.max(-0.97, Math.min(0.97, v));
  const pts: Point[] = [];
  const add = (x: number, y: number, label: 0 | 1) => pts.push({ x: clamp(x), y: clamp(y), label });
  if (name === 'clusters') {
    for (let i = 0; i < 40; i++) add(-0.45 + g() * 0.18, 0.35 + g() * 0.18, 1);
    for (let i = 0; i < 40; i++) add(0.45 + g() * 0.18, -0.35 + g() * 0.18, 0);
  } else if (name === 'xor') {
    for (let i = 0; i < 80; i++) {
      const x = r() * 1.8 - 0.9;
      const y = r() * 1.8 - 0.9;
      if (Math.abs(x) < 0.08 || Math.abs(y) < 0.08) continue;
      add(x, y, x * y > 0 ? 1 : 0);
    }
  } else if (name === 'circle') {
    for (let i = 0; i < 90; i++) {
      const a = r() * Math.PI * 2;
      const inner = i % 2 === 0;
      const rad = inner ? r() * 0.38 : 0.6 + r() * 0.3;
      add(Math.cos(a) * rad, Math.sin(a) * rad, inner ? 1 : 0);
    }
  } else {
    for (let i = 0; i < 50; i++) {
      const t = (i / 50) * 1.6 * Math.PI;
      const rad = 0.12 + (i / 50) * 0.78;
      for (const [label, turn] of [
        [1, 0],
        [0, Math.PI],
      ] as const)
        add(Math.cos(t + turn) * rad + g() * 0.03, Math.sin(t + turn) * rad + g() * 0.03, label);
    }
  }
  return pts.slice(0, MAX_POINTS);
}
