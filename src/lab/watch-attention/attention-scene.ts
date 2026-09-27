// The 3D view of "Watch attention": the sentence as a row of token blocks on
// a shallow curve, and an arc from the chosen token back to each token it
// attends to. An arc's thickness and brightness follow its weight, and a
// small pulse runs along each arc toward the chosen token, showing the
// direction information flows.
import {
  BoxGeometry,
  EdgesGeometry,
  Group,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  QuadraticBezierCurve3,
  SphereGeometry,
  TubeGeometry,
  Vector3,
} from 'three/webgpu';
import { createStage, type Palette } from '../shared/stage';
import { display, type Sentence } from './logic';

interface Block {
  centre: Vector3;
  width: number;
}

/** Token blocks laid left to right on a curve bowing toward the camera; width follows the text. */
export function blockLayout(tokens: string[]): Block[] {
  const widths = tokens.map((t) => 0.3 + 0.13 * display(t).length);
  const gap = 0.14;
  const total = widths.reduce((a, b) => a + b, 0) + gap * (tokens.length - 1);
  const scale = Math.min(1, 11 / total);
  let x = (-total * scale) / 2;
  return widths.map((w0) => {
    const w = w0 * scale;
    const cx = x + w / 2;
    x += w + gap * scale;
    return { centre: new Vector3(cx, -0.6, 1.1 * (1 - (cx / 6) ** 2)), width: w };
  });
}

export async function createAttentionScene(host: HTMLElement) {
  const created = await createStage(host);
  if (!created) return null;
  const stage = created;
  const { scene, camera } = stage;
  const labels = host.querySelector<HTMLElement>('[data-labels]');

  const frameMat = new LineBasicMaterial();
  const queryMat = new LineBasicMaterial();
  const unit = new BoxGeometry(1, 1, 1);
  const edges = new EdgesGeometry(unit);
  const pulseGeo = new SphereGeometry(1, 10, 8);
  const blocks = new Group();
  const arcs = new Group();
  scene.add(blocks, arcs);

  let palette = stage.palette;
  const paint = (p: Palette) => {
    palette = p;
    frameMat.color.copy(p.line);
    queryMat.color.copy(p.llm);
    for (const child of arcs.children) ((child as Mesh).material as MeshBasicMaterial).color.copy(p.llm);
  };
  paint(palette);
  stage.onTheme = paint;

  let layout: Block[] = [];
  let spans: HTMLSpanElement[] = [];
  let sentence: Sentence | null = null;
  let pulses: { mesh: Mesh; curve: QuadraticBezierCurve3; offset: number }[] = [];
  let time = 0;

  const clear = (g: Group) => {
    for (const child of [...g.children]) {
      g.remove(child);
      const m = child as Mesh;
      if (m.geometry && m.geometry !== unit && m.geometry !== edges && m.geometry !== pulseGeo)
        m.geometry.dispose();
      if (m.material && m.material !== frameMat && m.material !== queryMat)
        (m.material as MeshBasicMaterial).dispose();
    }
  };

  const placeLabels = () => {
    layout.forEach((b, i) => {
      const span = spans[i];
      const p = stage.project(b.centre.x, b.centre.y, b.centre.z);
      if (!span || !p) return;
      span.style.transform = `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px) translate(-50%, -50%)`;
    });
  };

  return {
    show(s: Sentence, weights: Float32Array, query: number) {
      if (s !== sentence) {
        sentence = s;
        layout = blockLayout(s.tokens);
        clear(blocks);
        for (const b of layout) {
          const box = new LineSegments(edges, frameMat);
          box.scale.set(b.width, 0.42, 0.2);
          box.position.copy(b.centre);
          blocks.add(box);
        }
        spans = s.tokens.map((t) => {
          const span = document.createElement('span');
          span.textContent = display(t);
          return span;
        });
        labels?.replaceChildren(...spans);
      }
      blocks.children.forEach((c, i) => ((c as LineSegments).material = i === query ? queryMat : frameMat));
      spans.forEach((sp, i) => (sp.dataset.state = i === query ? 'query' : ''));

      clear(arcs);
      pulses = [];
      const q = layout[query];
      if (!q) return;
      const top = (b: Block) => b.centre.clone().add(new Vector3(0, 0.24, 0));
      for (let k = 0; k < query; k++) {
        const w = weights[k] ?? 0;
        const b = layout[k];
        if (!b || w < 0.02) continue;
        const [from, to] = [top(b), top(q)];
        const lift = 0.5 + 0.55 * Math.sqrt(from.distanceTo(to));
        const mid = from
          .clone()
          .lerp(to, 0.5)
          .add(new Vector3(0, lift, 0));
        const curve = new QuadraticBezierCurve3(from, mid, to);
        const tube = new Mesh(
          new TubeGeometry(curve, 32, 0.008 + 0.05 * w, 6, false),
          new MeshBasicMaterial({
            color: palette.llm,
            transparent: true,
            opacity: 0.25 + 0.75 * Math.min(1, w * 2),
          }),
        );
        arcs.add(tube);
        const pulse = new Mesh(pulseGeo, new MeshBasicMaterial({ color: palette.llm }));
        pulse.scale.setScalar(0.03 + 0.07 * Math.sqrt(w));
        arcs.add(pulse);
        pulses.push({ mesh: pulse, curve, offset: k * 0.13 });
      }
    },
    update(dt: number) {
      time += dt;
      const aspect = stage.width / stage.height;
      const d = 6.4 / Math.tan((camera.fov * Math.PI) / 360) / Math.min(aspect, 1.7);
      const a = Math.sin(time * 0.15) * 0.18;
      camera.position.set(Math.sin(a) * d, d * 0.3, Math.cos(a) * d);
      camera.lookAt(0, 0.4, 0);
      camera.updateMatrixWorld();
      for (const p of pulses) p.mesh.position.copy(p.curve.getPoint((time * 0.5 + p.offset) % 1));
      placeLabels();
      stage.render();
    },
  };
}
