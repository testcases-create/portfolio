import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parse as parseYaml } from 'yaml';
import { NODE_H, NODE_W, columns, layout } from './diagram';
import { architecture } from './schemas';

const chain = architecture.parse({
  nodes: [
    { id: 'a', label: 'A', kind: 'client' },
    { id: 'b', label: 'B', kind: 'service' },
    { id: 'c', label: 'C', kind: 'store' },
    { id: 'd', label: 'D', kind: 'cache' },
  ],
  edges: [
    { from: 'a', to: 'b' },
    { from: 'b', to: 'c' },
    { from: 'a', to: 'd' },
  ],
  flows: [],
});

describe('diagram layout', () => {
  it('puts each node in the column of its longest path from an entry point', () => {
    expect(Object.fromEntries(columns(chain))).toEqual({ a: 0, b: 1, c: 2, d: 1 });
  });

  it('never overlaps two nodes', () => {
    for (const dir of readdirSync('src/content/projects')) {
      const arch = architecture.parse(
        parseYaml(readFileSync(`src/content/projects/${dir}/architecture.yaml`, 'utf8')),
      );
      const { nodes, width, height } = layout(arch);
      for (const a of nodes) {
        expect(a.x + NODE_W).toBeLessThanOrEqual(width);
        expect(a.y + NODE_H).toBeLessThanOrEqual(height);
        for (const b of nodes) {
          if (a === b) continue;
          const overlap =
            a.x < b.x + NODE_W && b.x < a.x + NODE_W && a.y < b.y + NODE_H && b.y < a.y + NODE_H;
          expect(overlap, `${dir}: ${a.id} overlaps ${b.id}`).toBe(false);
        }
      }
    }
  });

  it('draws every edge', () => {
    const { edges } = layout(chain);
    expect(edges.map((e) => `${e.from}>${e.to}`)).toEqual(['a>b', 'b>c', 'a>d']);
    for (const e of edges) expect(e.d).toMatch(/^M[\d.]+,[\d.]+ C/);
  });

  it('survives a cycle', () => {
    const cyclic = architecture.parse({
      nodes: [
        { id: 'a', label: 'A', kind: 'service' },
        { id: 'b', label: 'B', kind: 'service' },
      ],
      edges: [
        { from: 'a', to: 'b' },
        { from: 'b', to: 'a' },
      ],
      flows: [],
    });
    expect(layout(cyclic).edges).toHaveLength(2);
  });
});
