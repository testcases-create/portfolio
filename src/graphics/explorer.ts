// The architecture explorer (BRIEF.md 6.5), loaded only when "Explore in 3D"
// is pressed. It lays the project's architecture out in 3D, writes it into
// the world's SDE formation slots (graph.ts), and drives the camera; the world
// morphs into the graph with the particles it already has. Every node and flow
// is also a button in the dialog's list, so the keyboard and screen readers get
// the same choices as the mouse. Without a live world (the poster tier) the
// dialog is that list alone.
import type { Architecture } from '../lib/schemas';
import { layoutGraph, copySlot, writeGraph, type GraphView } from './graph';
import type { ExploreView } from './world';

const root = document.documentElement;

const POSTER_REASONS: Record<string, string> = {
  forced: 'the graphics quality is set to “Still image”',
  'reduced-motion': 'your system asks for reduced motion',
  'save-data': 'Save-Data is on',
  'no-webgl2': 'this browser has no WebGL2',
  'software-rendering': 'this browser has no usable GPU',
};

/** Waits until the world has picked its tier (boot decides after the page is idle). */
function worldReady(): Promise<void> {
  if (root.dataset.worldReady === 'true') return Promise.resolve();
  return new Promise((resolve) => {
    const observer = new MutationObserver(() => {
      if (root.dataset.worldReady !== 'true') return;
      observer.disconnect();
      resolve();
    });
    observer.observe(root, { attributes: true, attributeFilter: ['data-world-ready'] });
  });
}

export async function openExplorer(dialog: HTMLDialogElement): Promise<void> {
  const arch = JSON.parse(dialog.querySelector('[data-explore-data]')?.textContent ?? '{}') as Architecture;
  const status = dialog.querySelector<HTMLElement>('[data-explore-status]');
  const stage = dialog.querySelector<HTMLElement>('[data-explore-stage]');
  const nodeButtons = [...dialog.querySelectorAll<HTMLButtonElement>('[data-node]')];
  const flowButtons = [...dialog.querySelectorAll<HTMLButtonElement>('[data-flow]')];
  const labels = [...dialog.querySelectorAll<HTMLButtonElement>('[data-label]')];
  const layout = layoutGraph(arch);
  const view: GraphView = { focus: null, flow: null };
  const say = (text: string) => status && (status.textContent = text);
  const name = (id: string) => arch.nodes.find((n) => n.id === id)?.label ?? id;

  dialog.showModal();
  say('Loading the 3D view…');
  await worldReady();

  const tier = root.dataset.worldTier ?? 'poster';
  const live = tier !== 'poster' && tier !== 'pending';
  const world = live ? await (await import('./world-entry')).worldExplorer : null;
  if (!dialog.open) return;

  // Pose: the whole graph, or the focused node and its neighbours.
  const explore: ExploreView = {
    pose: { target: [0, 0, 0], radius: layout.radius, azimuth: 0.45, elevation: 0.32 },
    orbit: { azimuth: 0, elevation: 0, zoom: 1 },
    stage: { left: 0, top: 0, width: innerWidth, height: innerHeight },
  };
  const measure = () => {
    const r = stage?.getBoundingClientRect();
    if (r) explore.stage = { left: r.left, top: r.top, width: r.width, height: r.height };
  };

  const saved = new WeakMap<Float32Array, Float32Array>();
  const hooks = {
    apply(form: Float32Array, n: number) {
      if (!saved.has(form)) saved.set(form, copySlot(form, n));
      writeGraph(form, n, layout, view);
    },
    restore(form: Float32Array, n: number) {
      const s = saved.get(form);
      if (s) copySlot(form, n, s);
      saved.delete(form);
    },
  };

  function describe(): string {
    const parts: string[] = [];
    const f = view.flow === null ? null : arch.flows[view.flow];
    if (f) parts.push(`${f.name}: ${f.path.map(name).join(' → ')}.`);
    if (view.focus) {
      const links = layout.edges.flatMap((e) =>
        e.from === view.focus ? [`to ${name(e.to)}`] : e.to === view.focus ? [`from ${name(e.from)}`] : [],
      );
      parts.push(`${name(view.focus)}: connects ${links.join(', ')}.`);
    }
    if (!parts.length && live) parts.push('Showing every request flow.');
    return parts.join(' ');
  }

  function render() {
    for (const b of nodeButtons) b.setAttribute('aria-pressed', String(b.dataset.node === view.focus));
    for (const b of flowButtons) b.setAttribute('aria-pressed', String(Number(b.dataset.flow) === view.flow));
    const node = layout.nodes.find((n) => n.id === view.focus);
    explore.pose.target = node ? [...node.at] : [0, 0, 0];
    explore.pose.radius = node ? Math.max(1.8, layout.radius * 0.45) : layout.radius;
    world?.update();
    say(describe());
  }

  const focusNode = (id: string | null) => {
    view.focus = view.focus === id ? null : id;
    render();
  };
  const chooseFlow = (i: number) => {
    view.flow = view.flow === i ? null : i;
    render();
  };

  // The page is hidden while exploring, so the dialog can't restore focus by itself.
  const returnFocus = () =>
    dialog.parentElement?.querySelector<HTMLButtonElement>('[data-explore-open]')?.focus();

  const controller = new AbortController();
  const { signal } = controller;
  for (const b of nodeButtons)
    b.addEventListener('click', () => focusNode(b.dataset.node ?? null), { signal });
  for (const b of flowButtons)
    b.addEventListener('click', () => chooseFlow(Number(b.dataset.flow)), { signal });
  for (const b of labels) b.addEventListener('click', () => focusNode(b.dataset.label ?? null), { signal });
  dialog.querySelector('[data-explore-close]')?.addEventListener('click', () => dialog.close(), { signal });
  // Leaving the page closes the explorer first.
  document.addEventListener('astro:before-swap', () => dialog.close(), { signal });

  delete dialog.dataset.fallback;
  if (!world) {
    dialog.dataset.fallback = '';
    const reason = POSTER_REASONS[root.dataset.worldPosterReason ?? ''] ?? 'the live world is off';
    say('');
    const help = dialog.querySelector('[data-explore-help]');
    if (help)
      help.textContent = `The 3D view is off because ${reason}. Every component and flow is listed here.`;
    dialog.addEventListener('close', () => (controller.abort(), returnFocus()), { once: true });
    return;
  }

  // Turning the view: drag, arrow keys, and zoom with the wheel or + and −.
  const turn = (da: number, de: number) => {
    explore.orbit.azimuth += da;
    explore.orbit.elevation = Math.max(-0.9, Math.min(0.9, explore.orbit.elevation + de));
  };
  const zoom = (factor: number) => {
    explore.orbit.zoom = Math.max(0.45, Math.min(2.2, explore.orbit.zoom * factor));
  };
  let drag: { x: number; y: number; moved: boolean } | null = null;
  stage?.addEventListener(
    'pointerdown',
    (e) => {
      if ((e.target as Element).closest('[data-label]')) return;
      drag = { x: e.clientX, y: e.clientY, moved: false };
      stage.setPointerCapture(e.pointerId);
    },
    { signal },
  );
  stage?.addEventListener(
    'pointermove',
    (e) => {
      if (!drag) return;
      const [dx, dy] = [e.clientX - drag.x, e.clientY - drag.y];
      if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true;
      turn(-dx * 0.008, dy * 0.006);
      [drag.x, drag.y] = [e.clientX, e.clientY];
    },
    { signal },
  );
  stage?.addEventListener(
    'pointerup',
    (e) => {
      // A click without a drag focuses the nearest node, if one is close.
      if (drag && !drag.moved) {
        let best: string | null = null;
        let bestD = 56;
        for (const n of layout.nodes) {
          const p = world.project(n.at);
          const d = p ? Math.hypot(p.x - e.clientX, p.y - e.clientY) : Infinity;
          if (d < bestD) [best, bestD] = [n.id, d];
        }
        if (best) focusNode(best);
      }
      drag = null;
    },
    { signal },
  );
  stage?.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      zoom(Math.exp(e.deltaY * 0.001));
    },
    { signal, passive: false },
  );
  stage?.addEventListener(
    'keydown',
    (e) => {
      const keys: Record<string, () => void> = {
        ArrowLeft: () => turn(0.12, 0),
        ArrowRight: () => turn(-0.12, 0),
        ArrowUp: () => turn(0, 0.1),
        ArrowDown: () => turn(0, -0.1),
        '+': () => zoom(0.87),
        '=': () => zoom(0.87),
        '-': () => zoom(1.15),
      };
      const act = keys[e.key];
      if (!act) return;
      e.preventDefault();
      act();
    },
    { signal },
  );

  // Labels follow their nodes on screen.
  let frame = 0;
  const follow = () => {
    layout.nodes.forEach((n, i) => {
      const label = labels[i];
      if (!label) return;
      const p = world.project([n.at[0], n.at[1] + n.size[1] / 2 + 0.2, n.at[2]]);
      const inside =
        p &&
        p.x > explore.stage.left &&
        p.x < explore.stage.left + explore.stage.width &&
        p.y > explore.stage.top &&
        p.y < explore.stage.top + explore.stage.height;
      label.hidden = !inside;
      if (!p || !inside) return;
      const x = p.x - explore.stage.left;
      const y = p.y - explore.stage.top;
      label.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -100%)`;
      label.dataset.state = view.focus === n.id ? 'focus' : view.focus ? 'dim' : '';
    });
    frame = requestAnimationFrame(follow);
  };

  measure();
  addEventListener('resize', measure, { signal });
  world.enter(hooks, explore);
  render();
  frame = requestAnimationFrame(follow);

  dialog.addEventListener(
    'close',
    () => {
      cancelAnimationFrame(frame);
      controller.abort();
      world.exit();
      returnFocus();
    },
    { once: true },
  );
}
