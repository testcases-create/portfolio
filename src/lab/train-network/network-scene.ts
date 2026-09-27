// The network in 3D: one sphere per neuron, one cylinder per weight. A
// cylinder's thickness follows the weight's size; positive weights take the
// AI/ML colour and negative ones the neutral line colour. Neuron size and
// brightness follow their activation for the point under the pointer (or the
// keyboard cursor), and pulses run layer by layer to show that point's values
// passing through, each pulse sized by weight × activation.
import {
  Color,
  CylinderGeometry,
  InstancedMesh,
  MeshBasicMaterial,
  Object3D,
  SphereGeometry,
  Vector3,
} from 'three/webgpu';
import { createStage, type Palette } from '../shared/stage';
import { LAYERS, OFFSETS, type Activations } from './logic';

type V3 = [number, number, number];

/** Neuron positions, layer by layer, in a gentle arc so the layers read in depth. */
export function neuronPositions(): V3[][] {
  return LAYERS.map((count, L) => {
    const x = (L - (LAYERS.length - 1) / 2) * 2.3;
    return Array.from({ length: count }, (_, j): V3 => {
      const y = (j - (count - 1) / 2) * 0.62;
      return [x, y, -0.18 * y * y];
    });
  });
}

/** Every weight as [layer, from index, to index, parameter offset]. */
export function weightList(): [number, number, number, number][] {
  const out: [number, number, number, number][] = [];
  const offsets = [OFFSETS.w1, OFFSETS.w2, OFFSETS.w3];
  for (let L = 0; L < LAYERS.length - 1; L++) {
    const [nIn, nOut] = [LAYERS[L] ?? 0, LAYERS[L + 1] ?? 0];
    for (let j = 0; j < nOut; j++)
      for (let k = 0; k < nIn; k++) out.push([L, k, j, (offsets[L] ?? 0) + j * nIn + k]);
  }
  return out;
}

export async function createNetworkScene(host: HTMLElement) {
  const created = await createStage(host);
  if (!created) return null;
  const stage = created;
  const { scene, camera } = stage;
  const nodes = neuronPositions();
  const flat = nodes.flat();
  const weights = weightList();

  const neuronMat = new MeshBasicMaterial({ vertexColors: false });
  const neurons = new InstancedMesh(new SphereGeometry(1, 16, 12), neuronMat, flat.length);
  const edges = new InstancedMesh(
    new CylinderGeometry(1, 1, 1, 8, 1, true),
    new MeshBasicMaterial(),
    weights.length,
  );
  const pulses = new InstancedMesh(new SphereGeometry(1, 10, 8), new MeshBasicMaterial(), weights.length);
  for (const m of [neurons, edges, pulses]) m.frustumCulled = false;
  scene.add(edges, neurons, pulses);

  let palette = stage.palette;
  const paint = (p: Palette) => {
    palette = p;
    (pulses.material as MeshBasicMaterial).color.copy(p.ml);
  };
  paint(palette);
  stage.onTheme = paint;

  const dummy = new Object3D();
  const up = new Vector3(0, 1, 0);
  const dir = new Vector3();
  const colour = new Color();
  let phase = 0;
  let angle = 0;

  const frame = () => {
    const aspect = stage.width / stage.height;
    const d = 5.2 / Math.tan((camera.fov * Math.PI) / 360) / Math.min(aspect, 1.8);
    camera.position.set(Math.sin(angle) * d * 0.45, d * 0.18, Math.cos(angle) * d);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();
  };

  return {
    renderer: stage.renderer,
    backend: stage.backend,
    update(dt: number, params: ArrayLike<number>, acts: Activations, probe: { x: number; y: number }) {
      phase = (phase + dt * 1.1) % (LAYERS.length - 1 + 0.6);
      angle = Math.sin(performance.now() / 9000) * 0.35;
      frame();

      const layerActs = [[probe.x, probe.y], acts.h1, acts.h2, [acts.out * 2 - 1]];
      let n = 0;
      layerActs.forEach((layer, L) =>
        layer.forEach((a, j) => {
          const p = nodes[L]?.[j];
          if (!p) return;
          const mag = Math.min(1, Math.abs(a));
          dummy.position.set(...p);
          dummy.quaternion.identity();
          dummy.scale.setScalar(0.1 + 0.09 * mag);
          dummy.updateMatrix();
          neurons.setMatrixAt(n, dummy.matrix);
          neurons.setColorAt(n, colour.copy(palette.muted).lerp(palette.ml, mag));
          n++;
        }),
      );
      neurons.instanceMatrix.needsUpdate = true;
      if (neurons.instanceColor) neurons.instanceColor.needsUpdate = true;

      let shown = 0;
      weights.forEach(([L, k, j, off], i) => {
        const a = new Vector3(...(nodes[L]?.[k] ?? [0, 0, 0]));
        const b = new Vector3(...(nodes[L + 1]?.[j] ?? [0, 0, 0]));
        const w = params[off] ?? 0;
        const len = dir.subVectors(b, a).length();
        dummy.position.copy(a).add(b).multiplyScalar(0.5);
        dummy.quaternion.setFromUnitVectors(up, dir.normalize());
        const r = 0.006 + 0.03 * Math.min(1, Math.abs(w) / 2.5);
        dummy.scale.set(r, len, r);
        dummy.updateMatrix();
        edges.setMatrixAt(i, dummy.matrix);
        edges.setColorAt(i, colour.copy(w >= 0 ? palette.ml : palette.line));

        // A pulse on this layer's edges while the wave is passing through it.
        const t = phase - L;
        const from = layerActs[L]?.[k] ?? 0;
        const signal = Math.min(1, Math.abs(w * from));
        if (t >= 0 && t < 1 && signal > 0.05) {
          dummy.position.copy(a).lerp(b, t);
          dummy.quaternion.identity();
          dummy.scale.setScalar(0.03 + 0.06 * signal);
          dummy.updateMatrix();
          pulses.setMatrixAt(shown++, dummy.matrix);
        }
      });
      edges.instanceMatrix.needsUpdate = true;
      if (edges.instanceColor) edges.instanceColor.needsUpdate = true;
      pulses.count = shown;
      pulses.instanceMatrix.needsUpdate = true;
      stage.render();
    },
  };
}
