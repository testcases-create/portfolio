// Formation data, built once on the CPU from a fixed seed (PLAN.md 7.2, 12).
//
// Every particle has a slot in every formation, so moving between formations
// is one continuous transformation. A slot is two vec4:
//   A = (x, y, z, kind)   B = (x, y, z, param)
// The GPU kernel (sim.gpu.ts) and the CPU spec (sim.cpu.ts) turn a slot into
// a target position; this file only lays the shapes out.
import { curl } from './curl';
import { mulberry32 } from './random';

export const FORMATION_NAMES = ['data', 'ml', 'llm', 'sde', 'converge'] as const;
export type FormationName = (typeof FORMATION_NAMES)[number];
export const K = FORMATION_NAMES.length;
/** vec4 slots per particle: two per formation. */
export const STRIDE = K * 2;
export const FLOATS_PER_PARTICLE = STRIDE * 4;

/** What a slot's two points mean. Stored in A.w. */
export const Kind = {
  /** Sits at A. B.w is a formation-specific parameter. */
  POINT: 1,
  /** Moves from A to B with eased or linear progress; B.w is the phase. */
  FLOW: 2,
  /** Travels a Bézier arc from A to B; B.w = query token index + phase. */
  ARC: 3,
  /** A FLOW that decelerates into its target: backpressure in front of the queue. */
  QUEUE: 4,
  /** Slides along a strand segment from A to B and wraps; B.w is the phase. */
  STREAM: 5,
  /** A crisp token-block outline point; snaps into place. B.w is the token index. */
  BLOCK: 6,
  /** Flows along the trefoil knot. A is a small tube offset; B.w is the curve parameter. */
  KNOT: 7,
} as const;

export const TOKENS = [
  'The',
  ' cache',
  ' was',
  ' cold',
  ',',
  ' so',
  ' the',
  ' first',
  ' request',
  ' took',
  ' 8',
  '20',
  ' ms',
  '.',
];

/** Seconds for a data particle to cross its strand segment. */
export const STREAM_PERIOD = 2.6;
/** Strand segment length that maps to full brightness. */
export const STREAM_REF_LENGTH = 0.55;
export const KNOT_SCALE = 1;
export const KNOT_MAJOR = 1.9;
export const KNOT_MINOR = 0.85;
/** Seconds for one trip around the knot. */
export const KNOT_PERIOD = 70;

type V3 = [number, number, number];
const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const lerp = (a: V3, b: V3, t: number): V3 => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];

/**
 * A (2,3) torus knot: the trefoil drawn on a torus. From the front it reads as
 * a three-petal flower with an open centre, one continuous path (not three
 * rings). u in [0, 1) is the curve parameter; the result is before the spin.
 */
export function knotPoint(u: number): V3 {
  const t = u * Math.PI * 2;
  const rho = KNOT_MAJOR + KNOT_MINOR * Math.cos(3 * t);
  return [
    rho * Math.cos(2 * t) * KNOT_SCALE,
    rho * Math.sin(2 * t) * KNOT_SCALE,
    KNOT_MINOR * Math.sin(3 * t) * KNOT_SCALE,
  ];
}

/**
 * Which petal a knot point lies in, as s in [0, 3): floor(s) is the petal
 * (0 SDE, 1 LLM, 2 ML) and fract(s) is progress across it. Petals are centred
 * on 0°, 120° and 240°.
 */
export function knotSector(x: number, y: number): number {
  const a = Math.atan2(y, x) + Math.PI / 3;
  return ((((a / (Math.PI * 2)) % 1) + 1) % 1) * 3;
}

export interface TokenLayout {
  text: string;
  centre: V3;
  width: number;
  height: number;
}

/** Token blocks laid on a shallow curve that bows toward the camera. */
export function tokenLayout(): TokenLayout[] {
  const widths = TOKENS.map((t) => 0.16 + 0.09 * t.trim().length);
  const gap = 0.12;
  const total = widths.reduce((s, w) => s + w, 0) + gap * (TOKENS.length - 1);
  const scale = 10 / total;
  let x = (-total * scale) / 2;
  return TOKENS.map((text, i) => {
    const w = (widths[i] ?? 0) * scale;
    const cx = x + w / 2;
    x += w + gap * scale;
    // Bow: the middle of the sentence sits 1.2 units nearer the camera.
    const z = 1.2 * (1 - (cx / 5.2) ** 2);
    return { text, centre: [cx, -0.9, z], width: w, height: 0.42 };
  });
}

export const NETWORK_LAYERS = [5, 9, 12, 9, 4];
/** Each node connects to this many nodes in the next layer, so the structure stays legible. */
export const NETWORK_FAN_OUT = 3;

/** Node positions: each layer is a disc of nodes in the y–z plane (sunflower layout). */
export function networkNodes(): V3[][] {
  const golden = Math.PI * (3 - Math.sqrt(5));
  return NETWORK_LAYERS.map((count, L) => {
    const R = 0.42 * Math.sqrt(count);
    return Array.from({ length: count }, (_, j): V3 => {
      const r = R * Math.sqrt((j + 0.5) / count);
      const a = j * golden + L * 0.7;
      return [-4.4 + L * 2.2, r * Math.cos(a), r * Math.sin(a)];
    });
  });
}

export const SERVICE_NODES = {
  client: { at: [-4.9, 0, 0.4] as V3, size: [0.3, 0.9, 0.3] as V3 },
  lb: { at: [-3.2, 0, 0] as V3, size: [0.42, 0.42, 0.42] as V3 },
  s1: { at: [-1.1, 1.5, -1.2] as V3, size: [0.7, 0.4, 0.4] as V3 },
  s2: { at: [-1.1, 0, 1.3] as V3, size: [0.7, 0.4, 0.4] as V3 },
  s3: { at: [-1.1, -1.5, -0.6] as V3, size: [0.7, 0.4, 0.4] as V3 },
  cache: { at: [1.1, 1.6, 0.2] as V3, size: [0.48, 0.48, 0.48] as V3 },
  queue: { at: [1.1, -1.6, -1.4] as V3, size: [1.1, 0.24, 0.24] as V3 },
  worker: { at: [3.0, -1.6, -0.8] as V3, size: [0.5, 0.4, 0.4] as V3 },
  db: { at: [3.9, 0.3, 0.3] as V3, size: [0.6, 0.95, 0.6] as V3 },
};
type ServiceId = keyof typeof SERVICE_NODES;
/** [from, to, traffic weight] */
export const SERVICE_LINKS: [ServiceId, ServiceId, number][] = [
  ['client', 'lb', 3],
  ['lb', 's1', 1],
  ['lb', 's2', 1],
  ['lb', 's3', 1],
  ['s1', 'cache', 1],
  ['s2', 'cache', 0.6],
  ['s2', 'db', 0.8],
  ['cache', 'db', 0.3],
  ['s3', 'queue', 1.2],
  ['queue', 'worker', 0.6],
  ['worker', 'db', 0.6],
];

/**
 * Builds every formation for n particles.
 * Returns n * STRIDE vec4s, plus two per-particle hashes the kernels use.
 */
export function buildFormations(n: number, seed = 7): { data: Float32Array; hash: Float32Array } {
  const r = mulberry32(seed);
  const out = new Float32Array(n * FLOATS_PER_PARTICLE);
  const hash = new Float32Array(n);
  for (let i = 0; i < n; i++) hash[i] = r();

  const put = (i: number, k: number, a: V3, kind: number, b: V3 = [0, 0, 0], param = 0) => {
    out.set([a[0], a[1], a[2], kind, b[0], b[1], b[2], param], i * FLOATS_PER_PARTICLE + k * 8);
  };
  const gauss = () => Math.sqrt(-2 * Math.log(r() + 1e-9)) * Math.cos(2 * Math.PI * r());
  const inSphere = (s: number): V3 => {
    const v: V3 = [gauss(), gauss(), gauss()];
    const m = (s * Math.cbrt(r())) / (Math.hypot(...v) || 1);
    return [v[0] * m, v[1] * m, v[2] * m];
  };
  const weighted = (weights: number[]) => {
    const cum: number[] = [];
    let s = 0;
    for (const w of weights) cum.push((s += w));
    return () => {
      const x = r() * s;
      let lo = 0;
      let hi = cum.length - 1;
      while (lo < hi) {
        const m = (lo + hi) >> 1;
        if ((cum[m] ?? 0) < x) lo = m + 1;
        else hi = m;
      }
      return lo;
    };
  };
  const pick = <T>(list: T[]): T => list[Math.floor(r() * list.length)] as T;

  // 0 · Data: strands traced through the curl field. Each particle streams along a
  // short segment of one strand. The integration step is proportional to the local
  // flow speed, so a segment's length (and so the particle's speed and brightness)
  // follows the field.
  const strands: V3[][] = [];
  const cu: V3 = [0, 0, 0];
  const inside = (p: V3) => (p[0] / 5) ** 2 + (p[1] / 2.8) ** 2 + (p[2] / 2.4) ** 2 <= 1;
  for (let s = 0; s < 220; s++) {
    let p = inSphere(1);
    p = [p[0] * 4.6, p[1] * 2.5, p[2] * 2.1];
    const line: V3[] = [p];
    for (let step = 0; step < 120; step++) {
      curl(p[0] * 0.42, p[1] * 0.42, p[2] * 0.42, 0, cu);
      p = add(p, [cu[0] * 0.035, cu[1] * 0.035, cu[2] * 0.035]);
      if (!inside(p)) break;
      line.push(p);
    }
    if (line.length > 24) strands.push(line);
  }
  const SEG = 12; // strand steps per segment
  for (let i = 0; i < n; i++) {
    const line = pick(strands);
    const j = Math.floor(r() * (line.length - SEG));
    const jitter = inSphere(0.012);
    put(i, 0, add(line[j] as V3, jitter), Kind.STREAM, add(line[j + SEG] as V3, jitter), r());
  }

  // 1 · AI/ML: layer discs spread in depth. Edge particle density grows with |weight|.
  // param = progress through the network, 0 at the input layer and 1 at the output.
  const nodes = networkNodes();
  const lastLayer = NETWORK_LAYERS.length - 1;
  const edges: { a: V3; b: V3; L: number; w: number }[] = [];
  nodes.forEach((layer, L) => {
    const next = nodes[L + 1];
    if (!next) return;
    // Sparse, like a trained network after pruning: each node keeps a few outgoing
    // edges, and every node in the next layer receives at least one.
    const linked = new Set<number>();
    for (const a of layer) {
      for (let e = 0; e < NETWORK_FAN_OUT; e++) {
        const j = Math.floor(r() * next.length);
        linked.add(j);
        edges.push({ a, b: next[j] as V3, L, w: Math.abs(r() * 2 - 1) ** 1.4 + 0.15 });
      }
    }
    next.forEach((b, j) => {
      if (!linked.has(j)) edges.push({ a: pick(layer), b, L, w: 0.5 });
    });
  });
  const pickEdge = weighted(edges.map((e) => e.w));
  const flatNodes = nodes.flatMap((layer, L) => layer.map((p) => ({ p, L })));
  for (let i = 0; i < n; i++) {
    if (r() < 0.34) {
      const { p, L } = pick(flatNodes);
      put(i, 1, add(p, inSphere(0.11)), Kind.POINT, [0, 0, 0], L / lastLayer);
    } else {
      const e = edges[pickEdge()] as (typeof edges)[number];
      const t = r();
      put(i, 1, add(lerp(e.a, e.b, t), inSphere(0.01)), Kind.POINT, [0, 0, 0], (e.L + t) / lastLayer);
    }
  }

  // 2 · LLM: crisp token outlines, and attention arcs from key token i to query token j.
  // Most attention falls on recent tokens, and the first token acts as an attention sink.
  const tokens = tokenLayout();
  const pairs: { i: number; j: number; w: number }[] = [];
  for (let j = 1; j < tokens.length; j++) {
    for (let i = 0; i < j; i++) {
      if (i === 0 || j - i <= 7) {
        pairs.push({ i, j, w: (i === 0 ? 1.6 : 0) + Math.exp(-(j - i - 1) / 1.6) * (0.25 + r()) });
      }
    }
  }
  const pickPair = weighted(pairs.map((p) => p.w));
  const pickToken = weighted(tokens.map((t) => t.width + t.height));
  for (let i = 0; i < n; i++) {
    if (r() < 0.32) {
      const k = pickToken();
      const t = tokens[k] as TokenLayout;
      // A point on the block's outline: perimeter parametrised by u.
      const [w, h] = [t.width, t.height];
      let u = r() * 2 * (w + h);
      let x: number;
      let y: number;
      if (u < w) [x, y] = [u - w / 2, -h / 2];
      else if ((u -= w) < h) [x, y] = [w / 2, u - h / 2];
      else if ((u -= h) < w) [x, y] = [w / 2 - u, h / 2];
      else [x, y] = [-w / 2, h / 2 - (u - w)];
      const c = t.centre;
      put(i, 2, [c[0] + x, c[1] + y, c[2] + (r() - 0.5) * 0.015], Kind.BLOCK, [0, 0, 0], k);
    } else {
      const p = pairs[pickPair()] as (typeof pairs)[number];
      const [ti, tj] = [tokens[p.i] as TokenLayout, tokens[p.j] as TokenLayout];
      const top = (t: TokenLayout): V3 => [
        t.centre[0] + (r() - 0.5) * t.width * 0.6,
        t.centre[1] + t.height / 2 + 0.04,
        t.centre[2],
      ];
      put(i, 2, top(ti), Kind.ARC, top(tj), p.j + r() * 0.999);
    }
  }

  // 3 · SDE: a service graph in tiers and in depth. Boxes for nodes, faint edges, packets.
  const services = Object.values(SERVICE_NODES);
  const pickService = weighted(services.map(({ size: s }) => s[0] * s[1] + s[1] * s[2] + s[0] * s[2]));
  const pickLink = weighted(SERVICE_LINKS.map((l) => l[2]));
  const onBox = ({ at, size }: { at: V3; size: V3 }): V3 => {
    const p: V3 = [r() - 0.5, r() - 0.5, r() - 0.5];
    p[Math.floor(r() * 3)] = r() < 0.5 ? -0.5 : 0.5;
    return [at[0] + p[0] * size[0], at[1] + p[1] * size[1], at[2] + p[2] * size[2]];
  };
  for (let i = 0; i < n; i++) {
    const u = r();
    const [from, to] = SERVICE_LINKS[pickLink()] as (typeof SERVICE_LINKS)[number];
    const [a, b] = [SERVICE_NODES[from].at, SERVICE_NODES[to].at];
    if (u < 0.32)
      put(i, 3, onBox(services[pickService()] as (typeof services)[number]), Kind.POINT, [0, 0, 0], 0.85);
    else if (u < 0.5) put(i, 3, lerp(a, b, r()), Kind.POINT, [0, 0, 0], 0.2);
    else {
      const j = inSphere(0.07);
      // Packets travel in clumps of four phases, so they read as requests.
      put(
        i,
        3,
        add(a, j),
        to === 'queue' ? Kind.QUEUE : Kind.FLOW,
        add(b, j),
        Math.floor(r() * 4) / 4 + r() * 0.02,
      );
    }
  }

  // 4 · Converge: one knot, one continuous path. Its three petals carry the three
  // roles, each with a trace of its formation: packets (SDE), attention arcs
  // (LLM) and a pulse (AI/ML).
  const llmPetal: number[] = [];
  while (llmPetal.length < 256) {
    const u = r();
    const p = knotPoint(u);
    if (Math.floor(knotSector(p[0], p[1])) === 1) llmPetal.push(u);
  }
  for (let i = 0; i < n; i++) {
    if (r() < 0.12) {
      // Short attention chords between two nearby points of the LLM petal.
      const u1 = pick(llmPetal);
      const u2 = u1 + (0.02 + r() * 0.05) * (r() < 0.5 ? -1 : 1);
      put(i, 4, knotPoint(u1), Kind.ARC, knotPoint(u2), r() * 0.999);
    } else {
      put(i, 4, inSphere(0.06), Kind.KNOT, [0, 0, 0], r());
    }
  }
  return { data: out, hash };
}

/** Scatters particles on a sphere, where the intro gathers them from. */
export function scatter(pos: Float32Array, n: number, radius = 12, seed = 3): void {
  let a = seed;
  const r = () => {
    a = (a * 16807) % 2147483647;
    return a / 2147483647;
  };
  for (let i = 0; i < n; i++) {
    const y = r() * 2 - 1;
    const th = r() * Math.PI * 2;
    const rad = Math.sqrt(1 - y * y) * radius;
    pos.set([Math.cos(th) * rad, y * radius, Math.sin(th) * rad, 0], i * 4);
  }
}
