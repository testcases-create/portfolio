// DOM labels for the LLM formation (PLAN.md 12, note 4): the token text sits on
// its particle block, so a visitor can read the sentence being generated.
// Labels live inside #world, which is aria-hidden; the section text carries
// the meaning for assistive technology.
import { Vector3, type PerspectiveCamera } from 'three/webgpu';
import { tokenLayout } from './formations';

export function createLabels(host: HTMLElement) {
  const layer = document.createElement('div');
  layer.className = 'world-labels';
  const tokens = tokenLayout();
  const spans = tokens.map((t) => {
    const span = document.createElement('span');
    span.textContent = t.text.trim();
    layer.append(span);
    return span;
  });
  host.append(layer);
  const v = new Vector3();
  let lastOpacity = -1;

  return {
    /** weight: the LLM formation's current weight; cursor: token being generated. */
    update(camera: PerspectiveCamera, width: number, height: number, weight: number, cursor: number) {
      const opacity = Math.max(0, Math.min(1, (weight - 0.55) / 0.35));
      if (opacity !== lastOpacity) {
        layer.style.opacity = String(opacity);
        layer.hidden = opacity === 0;
        lastOpacity = opacity;
      }
      if (opacity === 0) return;
      tokens.forEach((t, i) => {
        const span = spans[i] as HTMLSpanElement;
        const top = v.set(t.centre[0], t.centre[1] + t.height / 2, t.centre[2]).project(camera).y;
        v.set(...t.centre).project(camera);
        const px = ((v.x + 1) / 2) * width;
        const py = ((1 - v.y) / 2) * height;
        // Font size follows the block's projected height, so near blocks read larger.
        const blockPx = Math.abs(top - v.y) * height;
        span.style.transform = `translate(${px.toFixed(1)}px, ${py.toFixed(1)}px) translate(-50%, -50%)`;
        span.style.fontSize = `${Math.max(9, blockPx * 0.62).toFixed(1)}px`;
        span.dataset.state = i < Math.floor(cursor) ? 'done' : i === Math.floor(cursor) ? 'now' : 'next';
      });
    },
    dispose() {
      layer.remove();
    },
  };
}
