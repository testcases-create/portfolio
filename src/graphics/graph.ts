// The architecture explorer's formation (PLAN.md 7.2, "graph"). It is built
// from the same architecture data as the static SVG diagram, and written into
// the SDE formation's slots, so the world morphs into it with the particles it
// already has and the GPU kernel needs no new code: nodes are boxes of POINT
// particles, edges are faint POINT lines, and packets FLOW along the flows.
import { columns } from '../lib/diagram';
import type { Architecture } from '../lib/schemas';
import { FLOATS_PER_PARTICLE, Kind } from './formations';
import { mulberry32 } from './random';

type V3 = [number, number, number];
type NodeKind = Architecture['nodes'][number]['kind'];

/** The SDE formation's index: the explorer borrows its slots. */
export const GRAPH_SLOT = 3;

/** Box sizes by kind, so a queue reads as a queue and a store as a cylinder-ish block. */
const SIZES: Record<NodeKind, V3> = {
  client: [0.34, 0.9, 0.34],
  gateway: [0.5, 0.5, 0.5],
  service: [0.8, 0.44, 0.44],
  model: [0.7, 0.7, 0.7],
  store: [0.6, 0.9, 0.6],
  cache: [0.5, 0.5, 0.5],
  queue: [1.1, 0.26, 0.26],
  external: [0.46, 0.46, 0.46],
};

export interface GraphNode {
  id: string;
  label: string;
  kind: NodeKind;
  at: V3;
  size: V3;
  layer: number;
}

export interface GraphLayout {
  nodes: GraphNode[];
  edges: { from: string; to: string }[];
  flows: { name: string; path: string[] }[];
  /** Radius of a sphere around the origin that holds every node. */
  radius: number;
}

/**
 * Layers run left to right (the longest path from an entry point, as in the
 * SVG); the nodes of a layer sit on a ring in the y–z plane, so the graph has
 * real depth instead of a flat side-on view.
 */
export function layoutGraph(arch: Architecture): GraphLayout {
  const col = columns(arch);
  const count = Math.max(...col.values()) + 1;
  const spacing = count > 1 ? Math.min(2.4, 9 / (count - 1)) : 0;
  const byLayer: string[][] = Array.from({ length: count }, () => []);
  for (const n of arch.nodes) byLayer[col.get(n.id) ?? 0]?.push(n.id);

  const nodes: GraphNode[] = [];
  byLayer.forEach((ids, L) => {
    const m = ids.length;
    const ring = m === 1 ? 0 : 0.55 + 0.35 * m;
    ids.forEach((id, j) => {
      const n = arch.nodes.find((node) => node.id === id);
      if (!n) return;
      const a = (j / m) * Math.PI * 2 + L * 0.6 + Math.PI / 2;
      nodes.push({
        id,
        label: n.label,
        kind: n.kind,
        layer: L,
        at: [(L - (count - 1) / 2) * spacing, ring * Math.sin(a), ring * Math.cos(a)],
        size: SIZES[n.kind],
      });
    });
  });
  const radius = Math.max(...nodes.map((n) => Math.hypot(...n.at) + Math.max(...n.size) * 0.6), 1.5);
  return { nodes, edges: arch.edges.map(({ from, to }) => ({ from, to })), flows: arch.flows, radius };
}

export interface GraphView {
  /** The focused node, or null. Its neighbours stay bright; the rest dim. */
  focus: string | null;
  /** The index of the flow whose packets run, or null for every flow. */
  flow: number | null;
}

/** Visibility of a node's box: focused, neighbour, or neither. */
export function nodeVisibility(layout: GraphLayout, id: string, view: GraphView): number {
  if (!view.focus) return 0.85;
  if (id === view.focus) return 1;
  const linked = layout.edges.some(
    (e) => (e.from === view.focus && e.to === id) || (e.to === view.focus && e.from === id),
  );
  return linked ? 0.6 : 0.22;
}

/** The hops packets run along: the chosen flow's, every flow's, or (with no flows) every edge. */
export function activeHops(layout: GraphLayout, view: GraphView): [string, string][] {
  const flows = view.flow === null ? layout.flows : layout.flows.slice(view.flow, view.flow + 1);
  const hops = flows.flatMap((f) => f.path.slice(1).map((to, i): [string, string] => [f.path[i] ?? to, to]));
  return hops.length ? hops : layout.edges.map((e): [string, string] => [e.from, e.to]);
}

/**
 * Writes the graph into formation slot GRAPH_SLOT of every particle. The same
 * seed gives every particle the same role on each call, so changing the focus
 * or the flow only changes brightness and packet routes, not the boxes.
 */
export function writeGraph(form: Float32Array, n: number, layout: GraphLayout, view: GraphView): void {
  const r = mulberry32(11);
  const at = new Map(layout.nodes.map((node) => [node.id, node]));
  const hops = activeHops(layout, view);
  const inFlow = new Set(hops.map(([a, b]) => `${a}>${b}`));
  const area = layout.nodes.map(({ size: s }) => s[0] * s[1] + s[1] * s[2] + s[0] * s[2]);
  const totalArea = area.reduce((a, b) => a + b, 0);
  const vis = layout.nodes.map((node) => nodeVisibility(layout, node.id, view));
  const put = (i: number, a: V3, kind: number, b: V3, param: number) =>
    form.set([a[0], a[1], a[2], kind, b[0], b[1], b[2], param], i * FLOATS_PER_PARTICLE + GRAPH_SLOT * 8);
  const lerp = (a: V3, b: V3, t: number): V3 => [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ];
  const jitter = (s: number): V3 => [(r() - 0.5) * s, (r() - 0.5) * s, (r() - 0.5) * s];
  const origin: V3 = [0, 0, 0];

  for (let i = 0; i < n; i++) {
    const u = r();
    if (u < 0.36) {
      // A point on a node's box surface, nodes picked by surface area.
      let x = r() * totalArea;
      let k = 0;
      while (k < area.length - 1 && x > (area[k] ?? 0)) x -= area[k++] ?? 0;
      const node = layout.nodes[k] as GraphNode;
      const p: V3 = [r() - 0.5, r() - 0.5, r() - 0.5];
      p[Math.floor(r() * 3)] = r() < 0.5 ? -0.5 : 0.5;
      const { at: c, size: s } = node;
      put(
        i,
        [c[0] + p[0] * s[0], c[1] + p[1] * s[1], c[2] + p[2] * s[2]],
        Kind.POINT,
        [0, 0, 0],
        vis[k] ?? 0,
      );
    } else if (u < 0.54) {
      // A faint line along an edge; brighter on the chosen flow's hops.
      const e = layout.edges[Math.floor(r() * layout.edges.length)] as GraphLayout['edges'][number];
      const [a, b] = [at.get(e.from)?.at ?? origin, at.get(e.to)?.at ?? origin];
      const lit = view.flow !== null && inFlow.has(`${e.from}>${e.to}`);
      const dim = view.flow !== null && !lit;
      put(i, lerp(a, b, r()), Kind.POINT, [0, 0, 0], lit ? 0.42 : dim ? 0.1 : 0.2);
    } else {
      // Packets in clumps of four phases, as in the SDE formation.
      const [from, to] = hops[Math.floor(r() * hops.length)] as [string, string];
      const [a, b] = [at.get(from)?.at ?? origin, at.get(to)?.at ?? origin];
      const j = jitter(0.12);
      const kind = at.get(to)?.kind === 'queue' ? Kind.QUEUE : Kind.FLOW;
      put(
        i,
        [a[0] + j[0], a[1] + j[1], a[2] + j[2]],
        kind,
        [b[0] + j[0], b[1] + j[1], b[2] + j[2]],
        Math.floor(r() * 4) / 4 + r() * 0.02,
      );
    }
  }
}

/** Copies formation slot GRAPH_SLOT out of (or back into) the formation data. */
export function copySlot(form: Float32Array, n: number, saved?: Float32Array): Float32Array {
  const out = saved ?? new Float32Array(n * 8);
  for (let i = 0; i < n; i++) {
    const off = i * FLOATS_PER_PARTICLE + GRAPH_SLOT * 8;
    if (saved) form.set(saved.subarray(i * 8, i * 8 + 8), off);
    else out.set(form.subarray(off, off + 8), i * 8);
  }
  return out;
}
