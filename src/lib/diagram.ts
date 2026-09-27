// Lays out an architecture graph for the static SVG diagram (the same data
// feeds the 3D explorer in Phase 4). Layered top to bottom, which suits a text
// column: a node's layer is the longest path to it from any entry point, and
// nodes within a layer are ordered to follow their parents, which keeps most
// edges from crossing. ("column" below means layer index.)
import type { Architecture } from './schemas';

export const NODE_W = 168;
export const NODE_H = 48;
const LAYER_GAP = 56;
const SIBLING_GAP = 24;
const PAD = 16;

export interface PlacedNode {
  id: string;
  label: string;
  kind: string;
  x: number;
  y: number;
  column: number;
}

export interface PlacedEdge {
  from: string;
  to: string;
  label?: string | undefined;
  /** SVG path data. */
  d: string;
  /** Where the label sits. */
  lx: number;
  ly: number;
}

export interface Layout {
  width: number;
  height: number;
  nodes: PlacedNode[];
  edges: PlacedEdge[];
}

/** Column index per node: the longest path to it from a node with no incoming edges. */
export function columns(arch: Architecture): Map<string, number> {
  const incoming = new Map(arch.nodes.map((n) => [n.id, [] as string[]]));
  for (const e of arch.edges) incoming.get(e.to)?.push(e.from);
  const memo = new Map<string, number>();
  const visiting = new Set<string>();
  const depth = (id: string): number => {
    const known = memo.get(id);
    if (known !== undefined) return known;
    if (visiting.has(id)) return 0; // a cycle: treat the back edge as absent
    visiting.add(id);
    const parents = incoming.get(id) ?? [];
    const d = parents.length ? Math.max(...parents.map((p) => depth(p) + 1)) : 0;
    visiting.delete(id);
    memo.set(id, d);
    return d;
  };
  for (const n of arch.nodes) depth(n.id);
  return memo;
}

export function layout(arch: Architecture): Layout {
  const col = columns(arch);
  const count = Math.max(...col.values()) + 1;
  const byColumn: string[][] = Array.from({ length: count }, () => []);
  for (const n of arch.nodes) byColumn[col.get(n.id) ?? 0]?.push(n.id);

  // Order each column by the mean row of its parents (one barycentre pass).
  const row = new Map<string, number>();
  byColumn.forEach((ids, c) => {
    if (c > 0) {
      const mean = (id: string) => {
        const rows = arch.edges.filter((e) => e.to === id).map((e) => row.get(e.from) ?? 0);
        return rows.length ? rows.reduce((a, b) => a + b, 0) / rows.length : 0;
      };
      ids.sort((a, b) => mean(a) - mean(b));
    }
    ids.forEach((id, r) => row.set(id, r));
  });

  const widest = Math.max(...byColumn.map((ids) => ids.length));
  const width = PAD * 2 + widest * NODE_W + (widest - 1) * SIBLING_GAP;
  const height = PAD * 2 + count * NODE_H + (count - 1) * LAYER_GAP;

  const nodes: PlacedNode[] = [];
  byColumn.forEach((ids, c) => {
    const layerWidth = ids.length * NODE_W + (ids.length - 1) * SIBLING_GAP;
    const left = (width - layerWidth) / 2;
    ids.forEach((id, r) => {
      const n = arch.nodes.find((node) => node.id === id);
      if (!n) return;
      nodes.push({
        ...n,
        column: c,
        x: left + r * (NODE_W + SIBLING_GAP),
        y: PAD + c * (NODE_H + LAYER_GAP),
      });
    });
  });

  const at = new Map(nodes.map((n) => [n.id, n]));
  const edges: PlacedEdge[] = arch.edges.flatMap((e) => {
    const a = at.get(e.from);
    const b = at.get(e.to);
    if (!a || !b) return [];
    const [ax, ay] = [a.x + NODE_W / 2, a.y + NODE_H];
    const [bx, by] = [b.x + NODE_W / 2, b.y];
    if (b.column > a.column) {
      const my = (ay + by) / 2;
      return [
        { ...e, d: `M${ax},${ay} C${ax},${my} ${bx},${my} ${bx},${by}`, lx: (ax + bx) / 2 + 6, ly: my + 4 },
      ];
    }
    // Same layer or upwards: loop out to the right of both nodes.
    const right = Math.max(a.x, b.x) + NODE_W + SIBLING_GAP / 2;
    const [sx, sy] = [a.x + NODE_W, a.y + NODE_H / 2];
    const [tx, ty] = [b.x + NODE_W, b.y + NODE_H / 2];
    return [
      { ...e, d: `M${sx},${sy} C${right},${sy} ${right},${ty} ${tx},${ty}`, lx: right, ly: (sy + ty) / 2 },
    ];
  });

  return { width, height, nodes, edges };
}
