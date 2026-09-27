// The 3D view of "Scale a system": boxes for the components, fills for how
// busy each one is, and a packet for each hop the simulation reports. Blue
// packets are requests and responses; failed responses are cubes in the text
// colour, so an error never depends on colour alone (the error rate is also
// in the read-outs).
import {
  BoxGeometry,
  EdgesGeometry,
  Group,
  InstancedMesh,
  LineBasicMaterial,
  LineSegments,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  SphereGeometry,
  Vector3,
} from 'three/webgpu';
import { createStage, type Palette } from '../shared/stage';
import { MODEL, type Hop, type NodeId, type Sim } from './logic';

type V3 = [number, number, number];

const MAX_PACKETS = 1400;
/** Seconds a packet takes on screen. The real hop is ~1 ms, far too fast to see. */
const TRAVEL = 0.45;
/** Packets per second drawn at most, so 2,000 requests per second stays legible. */
const DRAWN_PER_SECOND = 700;

interface Packet {
  from: V3;
  to: V3;
  t: number;
  error: boolean;
}

const FIXED: Record<string, { at: V3; size: V3; label: string }> = {
  client: { at: [-6, 0, 0], size: [0.5, 1.4, 0.5], label: 'Clients' },
  lb: { at: [-3.4, 0, 0], size: [0.6, 0.6, 0.6], label: 'Load balancer' },
  cache: { at: [2.6, 1.9, -0.4], size: [0.8, 0.6, 0.6], label: 'Cache' },
  db: { at: [5.4, 0.2, 0], size: [0.9, 1.5, 0.9], label: 'Database' },
  queue: { at: [2.4, -1.9, 0.4], size: [1.5, 0.34, 0.34], label: 'Write queue' },
  worker: { at: [4.3, -2.4, 0.6], size: [0.6, 0.5, 0.5], label: 'Queue workers' },
};

/** Replica positions for n replicas: a column, curving back in depth at the ends. */
export function replicaPositions(n: number): V3[] {
  const gap = Math.min(0.9, 5.4 / Math.max(1, n));
  return Array.from({ length: n }, (_, i): V3 => {
    const y = (i - (n - 1) / 2) * gap;
    return [-0.6, y, -0.25 * y * y];
  });
}

export async function createScaleScene(host: HTMLElement, initial: Sim) {
  const created = await createStage(host);
  if (!created) return null;
  const stage = created;
  let sim = initial;
  const { scene, camera } = stage;
  const labels = host.querySelector<HTMLElement>('[data-labels]');

  const outline = new LineBasicMaterial({ transparent: true, opacity: 0.9 });
  const outlineDim = new LineBasicMaterial({ transparent: true, opacity: 0.3 });
  const fill = new MeshBasicMaterial({ transparent: true, opacity: 0.45, depthWrite: false });
  const fillDown = new MeshBasicMaterial({ transparent: true, opacity: 0.25, depthWrite: false });
  const unit = new BoxGeometry(1, 1, 1);
  const edges = new EdgesGeometry(unit);

  interface Box {
    group: Group;
    frame: LineSegments;
    fill: Mesh;
    size: V3;
    label: HTMLSpanElement;
  }
  const makeBox = (at: V3, size: V3, text: string): Box => {
    const group = new Group();
    const frame = new LineSegments(edges, outline);
    frame.scale.set(...size);
    const inner = new Mesh(unit, fill);
    inner.scale.set(size[0] * 0.8, 0.0001, size[2] * 0.8);
    group.add(frame, inner);
    group.position.set(...at);
    scene.add(group);
    const label = document.createElement('span');
    label.textContent = text;
    labels?.append(label);
    return { group, frame, fill: inner, size, label };
  };
  /** Fill level in [0, 1], drawn from the bottom of the box up (or from the left for the queue). */
  const setFill = (box: Box, level: number, horizontal = false) => {
    const v = Math.max(0.0001, Math.min(1, level));
    const [w, h, d] = box.size;
    if (horizontal) {
      box.fill.scale.set(w * v, h * 0.8, d * 0.8);
      box.fill.position.set(-w / 2 + (w * v) / 2, 0, 0);
    } else {
      box.fill.scale.set(w * 0.8, h * v, d * 0.8);
      box.fill.position.set(0, -h / 2 + (h * v) / 2, 0);
    }
  };

  const fixed = new Map(Object.entries(FIXED).map(([id, n]) => [id, makeBox(n.at, n.size, n.label)]));
  const replicas: Box[] = Array.from({ length: 8 }, (_, i) =>
    makeBox([0, 0, 0], [0.9, 0.5, 0.5], `Replica ${i + 1}`),
  );

  const ok = new InstancedMesh(new SphereGeometry(0.07, 8, 6), new MeshBasicMaterial(), MAX_PACKETS);
  const bad = new InstancedMesh(new BoxGeometry(0.14, 0.14, 0.14), new MeshBasicMaterial(), MAX_PACKETS);
  ok.frustumCulled = bad.frustumCulled = false;
  scene.add(ok, bad);
  let packets: Packet[] = [];

  const paint = (p: Palette) => {
    outline.color.copy(p.line);
    outlineDim.color.copy(p.line);
    fill.color.copy(p.sde);
    fillDown.color.copy(p.muted);
    (ok.material as MeshBasicMaterial).color.copy(p.sde);
    (bad.material as MeshBasicMaterial).color.copy(p.text);
  };
  paint(stage.palette);
  stage.onTheme = paint;

  let shown = -1;
  const position = (id: NodeId): V3 => {
    const f = fixed.get(id);
    if (f) return f.group.position.toArray() as V3;
    const r = replicas[Number(id.slice(1))];
    return (r?.group.position.toArray() as V3 | undefined) ?? [0, 0, 0];
  };

  const placeLabels = () => {
    for (const box of [...fixed.values(), ...replicas]) {
      const p = box.group.position;
      const s = stage.project(p.x, p.y + box.size[1] / 2 + 0.12, p.z);
      box.label.hidden = !box.group.visible || !s;
      if (s)
        box.label.style.transform = `translate(${s.x.toFixed(1)}px, ${s.y.toFixed(1)}px) translate(-50%, -100%)`;
    }
  };

  const frameCamera = () => {
    // Fit the scene's width (about 13 units) with a view from slightly above and to the side.
    const aspect = stage.width / stage.height;
    const fit = 7 / Math.tan((camera.fov * Math.PI) / 360) / Math.min(aspect, 1.6);
    camera.position.set(fit * 0.16, fit * 0.3, fit * 0.92);
    camera.lookAt(-0.3, -0.1, 0);
    camera.updateMatrixWorld();
  };

  const layoutReplicas = (n: number) => {
    const at = replicaPositions(n);
    replicas.forEach((r, i) => {
      r.group.visible = i < n;
      const p = at[i];
      if (p) r.group.position.set(...p);
    });
    shown = n;
  };

  let rate = 0;
  const m4 = new Matrix4();
  const v = new Vector3();
  let lastW = 0;
  let lastH = 0;

  function update(dt: number, hops: Hop[], current: Sim) {
    sim = current;
    const m = sim.metrics();
    if (m.replicas.length !== shown) layoutReplicas(m.replicas.length);
    if (stage.width !== lastW || stage.height !== lastH || shown !== m.replicas.length) {
      [lastW, lastH] = [stage.width, stage.height];
      frameCamera();
    }

    // Draw a sample of hops when traffic is heavy; always draw errors.
    rate += (hops.length / Math.max(dt, 1e-3) - rate) * 0.1;
    const keep = Math.min(1, DRAWN_PER_SECOND / Math.max(1, rate));
    for (const h of hops) {
      if (!h.error && Math.random() > keep) continue;
      if (packets.length >= MAX_PACKETS) break;
      packets.push({ from: position(h.from), to: position(h.to), t: 0, error: !!h.error });
    }

    let nOk = 0;
    let nBad = 0;
    const next: Packet[] = [];
    for (const p of packets) {
      p.t += dt / TRAVEL;
      if (p.t >= 1) continue;
      next.push(p);
      const e = p.t * p.t * (3 - 2 * p.t);
      // A slight arc toward the camera, so crossing packets separate in depth.
      v.set(
        p.from[0] + (p.to[0] - p.from[0]) * e,
        p.from[1] + (p.to[1] - p.from[1]) * e,
        p.from[2] + (p.to[2] - p.from[2]) * e + Math.sin(Math.PI * e) * 0.25,
      );
      m4.makeTranslation(v.x, v.y, v.z);
      if (p.error) bad.setMatrixAt(nBad++, m4);
      else ok.setMatrixAt(nOk++, m4);
    }
    packets = next;
    ok.count = nOk;
    bad.count = nBad;
    ok.instanceMatrix.needsUpdate = true;
    bad.instanceMatrix.needsUpdate = true;

    m.replicas.forEach((r, i) => {
      const box = replicas[i];
      if (!box) return;
      box.frame.material = r.up ? outline : outlineDim;
      box.fill.material = r.up ? fill : fillDown;
      setFill(box, r.up ? (r.busy + r.queued) / (MODEL.workers + 20) : 1);
      box.label.textContent = `Replica ${i + 1}${r.up ? '' : ' (down)'}`;
    });
    const db = fixed.get('db');
    if (db) setFill(db, m.dbUtilisation);
    const queue = fixed.get('queue');
    if (queue) setFill(queue, m.queueDepth / 400, true);
    const cache = fixed.get('cache');
    if (cache) cache.group.visible = sim.config.cache;

    placeLabels();
    stage.render();
  }

  return {
    update,
    reset(next: Sim) {
      sim = next;
      packets = [];
    },
  };
}
