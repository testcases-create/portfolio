import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parse as parseYaml } from 'yaml';
import { architecture, type Architecture } from '../lib/schemas';
import { FLOATS_PER_PARTICLE, Kind, buildFormations } from './formations';
import { GRAPH_SLOT, activeHops, copySlot, layoutGraph, nodeVisibility, writeGraph } from './graph';

const real: [string, Architecture][] = readdirSync('src/content/projects').map((dir) => [
  dir,
  architecture.parse(parseYaml(readFileSync(`src/content/projects/${dir}/architecture.yaml`, 'utf8'))),
]);
const gateway = real.find(([dir]) => dir === 'inference-gateway')?.[1] as Architecture;
const slot = (form: Float32Array, i: number) =>
  form.subarray(i * FLOATS_PER_PARTICLE + GRAPH_SLOT * 8, i * FLOATS_PER_PARTICLE + GRAPH_SLOT * 8 + 8);

describe('graph layout', () => {
  it('places every node, keeps boxes apart, and fits them in its radius', () => {
    for (const [dir, arch] of real) {
      const g = layoutGraph(arch);
      expect(g.nodes.map((n) => n.id).sort(), dir).toEqual(arch.nodes.map((n) => n.id).sort());
      for (const a of g.nodes) {
        expect(Math.hypot(...a.at), `${dir}/${a.id}`).toBeLessThan(g.radius);
        for (const b of g.nodes) {
          if (a === b) continue;
          const gap = Math.hypot(a.at[0] - b.at[0], a.at[1] - b.at[1], a.at[2] - b.at[2]);
          const reach = (Math.max(...a.size) + Math.max(...b.size)) / 2;
          expect(gap, `${dir}: ${a.id} and ${b.id} overlap`).toBeGreaterThan(reach);
        }
      }
    }
  });

  it('runs layers left to right, like the SVG', () => {
    const g = layoutGraph(gateway);
    const x = (id: string) => g.nodes.find((n) => n.id === id)?.at[0] ?? NaN;
    expect(x('client')).toBeLessThan(x('gateway'));
    expect(x('gateway')).toBeLessThan(x('batcher'));
    expect(x('batcher')).toBeLessThan(x('model'));
  });
});

describe('graph views', () => {
  const g = layoutGraph(gateway);

  it('runs packets along the chosen flow, or along every flow', () => {
    expect(activeHops(g, { focus: null, flow: 0 })).toEqual([
      ['client', 'gateway'],
      ['gateway', 'cache'],
    ]);
    expect(activeHops(g, { focus: null, flow: null })).toHaveLength(7);
  });

  it('keeps the focused node brightest, its neighbours next, and dims the rest', () => {
    const view = { focus: 'gateway', flow: null };
    expect(nodeVisibility(g, 'gateway', view)).toBe(1);
    expect(nodeVisibility(g, 'cache', view)).toBeGreaterThan(nodeVisibility(g, 'model', view));
    expect(nodeVisibility(g, 'model', { focus: null, flow: null })).toBeGreaterThan(0.5);
  });

  it('writes only the graph slot, and changing the focus moves nothing', () => {
    const n = 2000;
    const { data } = buildFormations(n);
    const before = data.slice();
    writeGraph(data, n, g, { focus: null, flow: null });
    const a = data.slice();
    writeGraph(data, n, g, { focus: 'model', flow: null });
    for (let i = 0; i < n; i++) {
      for (let k = 0; k < FLOATS_PER_PARTICLE; k++) {
        const j = i * FLOATS_PER_PARTICLE + k;
        if (Math.floor(k / 8) !== GRAPH_SLOT) expect(data[j]).toBe(before[j]);
      }
      const [x, y, z, kind] = slot(data, i);
      expect([Kind.POINT, Kind.FLOW, Kind.QUEUE]).toContain(kind);
      expect([x, y, z]).toEqual(Array.from(slot(a, i).subarray(0, 3)));
    }
  });

  it('starts every packet at a node on an active hop', () => {
    const n = 3000;
    const { data } = buildFormations(n);
    writeGraph(data, n, g, { focus: null, flow: 1 });
    const hops = activeHops(g, { focus: null, flow: 1 });
    const at = (id: string) => g.nodes.find((node) => node.id === id)?.at ?? [0, 0, 0];
    let packets = 0;
    for (let i = 0; i < n; i++) {
      const s = slot(data, i);
      if (s[3] !== Kind.FLOW) continue;
      packets++;
      const onHop = hops.some(([from]) => Math.hypot(...at(from).map((v, c) => v - (s[c] ?? 0))) < 0.11);
      expect(onHop).toBe(true);
    }
    expect(packets).toBeGreaterThan(n * 0.3);
  });

  it('puts the SDE formation back exactly', () => {
    const n = 500;
    const { data } = buildFormations(n);
    const original = data.slice();
    const saved = copySlot(data, n);
    writeGraph(data, n, g, { focus: 'cache', flow: 2 });
    copySlot(data, n, saved);
    expect(data).toEqual(original);
  });
});
