// The CPU simulation. It runs the low tier, and it is the specification the GPU
// kernel in sim.gpu.ts must match: tests/e2e/world.spec.ts steps both from the
// same state and compares the buffers.
import { curl } from './curl';
import {
  FLOATS_PER_PARTICLE,
  K,
  Kind,
  KNOT_PERIOD,
  STREAM_PERIOD,
  STREAM_REF_LENGTH,
  knotPoint,
  knotSector,
} from './formations';
import {
  CURL_GAIN,
  CURL_SCALE,
  DAMPING,
  DATA_SPIN,
  FLOW_AMP,
  KNOT_SPIN,
  POINTER_FALLOFF,
  POINTER_GAIN,
  RIGID_AT,
  SIGNAL_GAIN,
  SIZE,
  STIFFNESS,
  type SimInputs,
} from './sim.shared';

type RGB = [number, number, number];

/** One formation's opinion about one particle. */
export interface Target {
  x: number;
  y: number;
  z: number;
  /** Signal strength: pulses, packets, the current attention arcs. Only signals bloom. */
  sig: number;
  /** Visibility, multiplied into alpha. */
  vis: number;
  /** How far the colour leans from neutral toward `hue`. */
  tint: number;
  hue: RGB;
  /** 1 when the particle should follow its path exactly once formed. */
  rigid: number;
}

export const smoothstep = (e0: number, e1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};
export const fract = (x: number) => x - Math.floor(x);
const step = (edge: number, x: number) => (x >= edge ? 1 : 0);
const mixN = (a: number, b: number, t: number) => a + (b - a) * t;

/** Arc apex height grows with the square root of the distance it spans. */
export const arcLift = (dx: number) => 0.8 + 1.4 * Math.sqrt(dx);

/** Rotation about z: the knot spins about its own axis of symmetry, so its silhouette stays a trefoil. */
function rotZ(o: Target, x: number, y: number, z: number, angle: number) {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  o.x = x * c - y * s;
  o.y = x * s + y * c;
  o.z = z;
}

function rotY(o: Target, x: number, y: number, z: number, angle: number) {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  o.x = x * c + z * s;
  o.y = y;
  o.z = z * c - x * s;
}

/** Quadratic Bézier from a to b with its control point lifted by `lift` in y. */
function arc(o: Target, a: ArrayLike<number>, b: ArrayLike<number>, lift: number, t: number) {
  const u = 1 - t;
  const [ax, ay, az] = [a[0] ?? 0, a[1] ?? 0, a[2] ?? 0];
  const [bx, by, bz] = [b[0] ?? 0, b[1] ?? 0, b[2] ?? 0];
  const [cx, cy, cz] = [(ax + bx) / 2, (ay + by) / 2 + lift, (az + bz) / 2];
  o.x = ax * u * u + cx * 2 * u * t + bx * t * t;
  o.y = ay * u * u + cy * 2 * u * t + by * t * t;
  o.z = az * u * u + cz * 2 * u * t + bz * t * t;
}

const roleByHash = (h: number, U: SimInputs): RGB => (h < 1 / 3 ? U.sde : h < 2 / 3 ? U.llm : U.ml);

/**
 * Target for formation k. `a` and `b` are the slot's two vec4; `h` is the
 * particle's hash in [0, 1).
 */
export function target(
  k: number,
  a: ArrayLike<number>,
  b: ArrayLike<number>,
  h: number,
  U: SimInputs,
  o: Target,
): void {
  const t = U.time;
  const kind = a[3] ?? 0;
  const param = b[3] ?? 0;
  o.rigid = 0;
  o.sig = 0;

  if (k === 0) {
    // Data: stream along a strand segment; brightness follows the segment's speed.
    const s = fract(param + t / STREAM_PERIOD);
    const len = Math.hypot((b[0] ?? 0) - (a[0] ?? 0), (b[1] ?? 0) - (a[1] ?? 0), (b[2] ?? 0) - (a[2] ?? 0));
    const x = mixN(a[0] ?? 0, b[0] ?? 0, s);
    const y = mixN(a[1] ?? 0, b[1] ?? 0, s);
    const z = mixN(a[2] ?? 0, b[2] ?? 0, s);
    rotY(o, x, y, z, t * DATA_SPIN);
    const speed = Math.min(1, len / STREAM_REF_LENGTH);
    o.vis = (0.3 + 0.7 * speed) * smoothstep(0, 0.12, s) * (1 - smoothstep(0.88, 1, s));
    o.tint = step(0.93, h) * 0.85;
    o.hue = roleByHash(fract(h * 7.13), U);
    o.rigid = 1;
    return;
  }

  if (k === 1) {
    // AI/ML: a pulse sweeps through the network, layer by layer.
    o.x = a[0] ?? 0;
    o.y = a[1] ?? 0;
    o.z = a[2] ?? 0;
    o.sig = Math.exp(-(((param - U.front) / 0.045) ** 2));
    o.vis = 1;
    o.tint = 0.22;
    o.hue = U.ml;
    return;
  }

  if (k === 2) {
    // LLM: tokens appear one by one; the newest token's arcs light up.
    const idx = Math.floor(param);
    const generated = step(idx, U.cursor);
    const now = 1 - Math.min(Math.abs(idx - Math.floor(U.cursor)), 1);
    o.hue = U.llm;
    if (kind !== Kind.ARC) {
      o.x = a[0] ?? 0;
      o.y = a[1] ?? 0;
      o.z = a[2] ?? 0;
      o.vis = mixN(0.1, 1, generated);
      o.sig = now * 0.6;
      o.tint = 0.3 + 0.4 * generated;
      o.rigid = 1;
      return;
    }
    const s = fract(fract(param) + t * 0.3);
    arc(o, a, b, arcLift(Math.abs((b[0] ?? 0) - (a[0] ?? 0))), s);
    o.vis = generated * (0.2 + 0.8 * now) * smoothstep(0, 0.06, s) * (1 - smoothstep(0.94, 1, s));
    o.sig = now;
    o.tint = 0.25;
    o.rigid = 1;
    return;
  }

  if (k === 3) {
    // SDE: packets move along links; they bunch up in front of the queue.
    o.tint = 0.3;
    o.hue = U.sde;
    if (kind === Kind.POINT) {
      o.x = a[0] ?? 0;
      o.y = a[1] ?? 0;
      o.z = a[2] ?? 0;
      o.vis = param;
      return;
    }
    const s = fract(param + t * 0.3);
    const eased = kind === Kind.QUEUE ? 1 - (1 - s) ** 2.4 : s;
    o.x = mixN(a[0] ?? 0, b[0] ?? 0, eased);
    o.y = mixN(a[1] ?? 0, b[1] ?? 0, eased);
    o.z = mixN(a[2] ?? 0, b[2] ?? 0, eased);
    o.vis = smoothstep(0, 0.05, s) * (1 - smoothstep(0.93, 1, s));
    o.sig = 1;
    o.rigid = 1;
    return;
  }

  // Converge: one knot, three petals, one per role.
  o.tint = 0.85;
  o.rigid = 1;
  const spin = t * KNOT_SPIN;
  if (kind === Kind.ARC) {
    // LLM petal: attention chords that fade in and out in turn.
    const s = fract(param + t * 0.35);
    arc(o, a, b, 0.25, s);
    rotZ(o, o.x, o.y, o.z, spin);
    o.vis = 0.8 * smoothstep(0, 0.1, s) * (1 - smoothstep(0.9, 1, s));
    o.sig = 0.6;
    o.hue = U.llm;
    return;
  }
  const u = fract(param + t / KNOT_PERIOD);
  const p = knotPoint(u);
  rotZ(o, p[0] + (a[0] ?? 0), p[1] + (a[1] ?? 0), p[2] + (a[2] ?? 0), spin);
  const l = knotSector(p[0], p[1]);
  const lobe = Math.floor(l) % 3;
  const edge = smoothstep(0.85, 1, fract(l));
  const colours = [U.sde, U.llm, U.ml];
  const from = colours[lobe] as RGB;
  const to = colours[(lobe + 1) % 3] as RGB;
  o.hue = [mixN(from[0], to[0], edge), mixN(from[1], to[1], edge), mixN(from[2], to[2], edge)];
  // The SDE petal carries packets; the ML petal carries a pulse.
  const packets = step(0.82, fract(u * 36 - t * 0.9)) * (lobe === 0 ? 1 : 0);
  const pulse = Math.exp(-(((fract(l) - fract(t * 0.25)) / 0.06) ** 2)) * (lobe === 2 ? 1 : 0);
  o.sig = packets + pulse;
  o.vis = 0.9;
}

export interface CpuState {
  n: number;
  /** n * FLOATS_PER_PARTICLE, from buildFormations. */
  form: Float32Array;
  hash: Float32Array;
  /** xyz = position, w = signal. */
  pos: Float32Array;
  /** xyz = velocity, w = sprite size multiplier. */
  vel: Float32Array;
  /** rgb + alpha. */
  col: Float32Array;
}

const scratch: Target = { x: 0, y: 0, z: 0, sig: 0, vis: 0, tint: 0, hue: [0, 0, 0], rigid: 0 };
const cu = [0, 0, 0];
const slotA = new Float32Array(4);
const slotB = new Float32Array(4);

/** Advances every particle by U.dt. Mirrors the GPU kernel line for line. */
export function stepCpu(S: CpuState, U: SimInputs): void {
  const { n, form, hash, pos: P, vel: V, col: C } = S;
  const damp = Math.exp(-DAMPING * U.dt);
  const [px, py, pz] = U.pointer;
  const o = scratch;
  for (let i = 0; i < n; i++) {
    let tx = 0;
    let ty = 0;
    let tz = 0;
    let sig = 0;
    let vis = 0;
    let tint = 0;
    let hr = 0;
    let hg = 0;
    let hb = 0;
    let flow = 0;
    let stiff = 0;
    let rigid = 0;
    let size = 0;
    for (let k = 0; k < K; k++) {
      const w = U.weights[k] ?? 0;
      if (w <= 0) continue; // the GPU evaluates all five; a zero weight contributes nothing either way
      const off = i * FLOATS_PER_PARTICLE + k * 8;
      slotA.set(form.subarray(off, off + 4));
      slotB.set(form.subarray(off + 4, off + 8));
      target(k, slotA, slotB, hash[i] ?? 0, U, o);
      tx += o.x * w;
      ty += o.y * w;
      tz += o.z * w;
      sig += o.sig * w;
      vis += o.vis * w;
      tint += o.tint * w;
      hr += o.hue[0] * w;
      hg += o.hue[1] * w;
      hb += o.hue[2] * w;
      flow += (FLOW_AMP[k] ?? 0) * w;
      stiff += (STIFFNESS[k] ?? 0) * w;
      rigid += o.rigid * w;
      size += (SIZE[k] ?? 0) * w;
    }
    const p = i * 4;
    let x = P[p] ?? 0;
    let y = P[p + 1] ?? 0;
    let z = P[p + 2] ?? 0;
    curl(x * CURL_SCALE, y * CURL_SCALE, z * CURL_SCALE, U.time, cu);
    const dx = px - x;
    const dy = py - y;
    const dz = pz - z;
    const pull =
      Math.exp(-POINTER_FALLOFF * (dx * dx + dy * dy + dz * dz)) * U.pointerStrength * POINTER_GAIN;
    const ks = stiff * U.assemble;
    const f = flow * CURL_GAIN;
    let vx = (V[p] ?? 0) * damp + ((tx - x) * ks + (cu[0] ?? 0) * f + dx * pull) * U.dt;
    let vy = (V[p + 1] ?? 0) * damp + ((ty - y) * ks + (cu[1] ?? 0) * f + dy * pull) * U.dt;
    let vz = (V[p + 2] ?? 0) * damp + ((tz - z) * ks + (cu[2] ?? 0) * f + dz * pull) * U.dt;
    x += vx * U.dt;
    y += vy * U.dt;
    z += vz * U.dt;
    if (rigid >= RIGID_AT && U.assemble >= 0.99) {
      [x, y, z] = [tx, ty, tz];
      [vx, vy, vz] = [0, 0, 0];
    }
    P[p] = x;
    P[p + 1] = y;
    P[p + 2] = z;
    P[p + 3] = sig;
    V[p] = vx;
    V[p + 1] = vy;
    V[p + 2] = vz;
    V[p + 3] = size;
    const m = Math.min(1, Math.max(0, tint + U.tintBoost + sig));
    C[p] = U.neutral[0] + (hr - U.neutral[0]) * m;
    C[p + 1] = U.neutral[1] + (hg - U.neutral[1]) * m;
    C[p + 2] = U.neutral[2] + (hb - U.neutral[2]) * m;
    C[p + 3] = vis * U.alpha * (1 + sig * SIGNAL_GAIN);
  }
}
