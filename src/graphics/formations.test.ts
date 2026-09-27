import { describe, expect, it } from 'vitest';
import {
  FLOATS_PER_PARTICLE,
  K,
  Kind,
  NETWORK_LAYERS,
  TOKENS,
  buildFormations,
  knotPoint,
  knotSector,
  networkNodes,
  scatter,
  tokenLayout,
} from './formations';

const n = 2048;
const { data, hash } = buildFormations(n);
const slot = (i: number, k: number) =>
  data.subarray(i * FLOATS_PER_PARTICLE + k * 8, i * FLOATS_PER_PARTICLE + k * 8 + 8);
const kinds = (k: number) => new Set(Array.from({ length: n }, (_, i) => slot(i, k)[3]));

describe('buildFormations', () => {
  it('fills a slot for every particle in every formation, with finite values', () => {
    expect(data.length).toBe(n * FLOATS_PER_PARTICLE);
    expect(hash.length).toBe(n);
    expect(data.every(Number.isFinite)).toBe(true);
  });

  it('is deterministic for a seed', () => {
    expect(buildFormations(64).data).toEqual(buildFormations(64).data);
    expect(buildFormations(64, 1).data).not.toEqual(buildFormations(64, 2).data);
  });

  it('uses the expected kinds per formation', () => {
    expect(kinds(0)).toEqual(new Set([Kind.STREAM]));
    expect(kinds(1)).toEqual(new Set([Kind.POINT]));
    expect(kinds(2)).toEqual(new Set([Kind.BLOCK, Kind.ARC]));
    expect(kinds(3)).toEqual(new Set([Kind.POINT, Kind.FLOW, Kind.QUEUE]));
    expect(kinds(4)).toEqual(new Set([Kind.KNOT, Kind.ARC]));
  });

  it('keeps every formation within a bounded region', () => {
    for (let k = 0; k < K; k++) {
      for (let i = 0; i < n; i++) {
        const s = slot(i, k);
        expect(Math.hypot(s[0] ?? 0, s[1] ?? 0, s[2] ?? 0)).toBeLessThan(7);
      }
    }
  });

  it('gives LLM blocks a valid token index and arcs a later query token', () => {
    for (let i = 0; i < n; i++) {
      const s = slot(i, 2);
      const idx = Math.floor(s[7] ?? -1);
      expect(idx).toBeGreaterThanOrEqual(0);
      expect(idx).toBeLessThan(TOKENS.length);
    }
  });

  it('puts every LLM chord of the knot inside the LLM petal', () => {
    for (let i = 0; i < n; i++) {
      const s = slot(i, 4);
      if (s[3] !== Kind.ARC) continue;
      expect(Math.floor(knotSector(s[0] ?? 0, s[1] ?? 0))).toBe(1);
    }
  });
});

describe('shapes', () => {
  it('lays out one token block per token, left to right', () => {
    const layout = tokenLayout();
    expect(layout.map((t) => t.text)).toEqual(TOKENS);
    for (let i = 1; i < layout.length; i++) {
      expect(layout[i]?.centre[0]).toBeGreaterThan(layout[i - 1]?.centre[0] ?? Infinity);
    }
  });

  it('spreads each network layer in depth', () => {
    const nodes = networkNodes();
    expect(nodes.map((l) => l.length)).toEqual(NETWORK_LAYERS);
    for (const layer of nodes) {
      const zs = layer.map((p) => p[2]);
      expect(Math.max(...zs) - Math.min(...zs)).toBeGreaterThan(0.5);
    }
  });

  it('closes the knot and gives it three petals', () => {
    const [a, b] = [knotPoint(0), knotPoint(1)];
    a.forEach((v, j) => expect(v).toBeCloseTo(b[j] ?? NaN, 9));
    const petals = new Set(
      Array.from({ length: 300 }, (_, i) =>
        Math.floor(knotSector(...(knotPoint(i / 300).slice(0, 2) as [number, number]))),
      ),
    );
    expect(petals).toEqual(new Set([0, 1, 2]));
  });

  it('scatters on a sphere of the given radius', () => {
    const pos = new Float32Array(40);
    scatter(pos, 10, 12);
    for (let i = 0; i < 10; i++)
      expect(Math.hypot(pos[i * 4] ?? 0, pos[i * 4 + 1] ?? 0, pos[i * 4 + 2] ?? 0)).toBeCloseTo(12, 3);
  });
});
