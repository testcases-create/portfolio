// "Scale a system": wires the controls to the simulation (logic.ts) and keeps
// the read-outs current. The 3D view (system-scene.ts, which brings three.js) loads
// only when the world's tier allows one; without it the read-outs, the
// replica list and the summary carry the whole demo.
import { createLoop, tierReady } from '../shared/loop';
import { MODEL, createSim, type Failure } from './logic';

const ms = (v: number) => (v >= 1000 ? `${(v / 1000).toFixed(2)} s` : `${Math.round(v)} ms`);
const pct = (v: number) => `${(v * 100).toFixed(v > 0 && v < 0.1 ? 1 : 0)}%`;

export async function mount(el: HTMLElement): Promise<void> {
  const form = el.querySelector<HTMLFormElement>('[data-controls]');
  const view = el.querySelector<HTMLElement>('[data-view]');
  const list = el.querySelector<HTMLElement>('[data-replicas]');
  const summary = el.querySelector<HTMLElement>('[data-summary]');
  const pause = el.querySelector<HTMLButtonElement>('[data-pause]');
  if (!form || !view || !list || !summary || !pause) return;
  const field = <T extends Element>(name: string) => form.elements.namedItem(name) as T | null;
  const metric = (name: string) => el.querySelector<HTMLElement>(`[data-metric="${name}"]`);

  let seed = 1;
  let sim = createSim({}, seed);
  let scene: Awaited<ReturnType<typeof import('./system-scene').createScaleScene>> = null;

  function readControls() {
    const failure = (form?.querySelector<HTMLInputElement>('[name="failure"]:checked')?.value ??
      'none') as Failure;
    sim.set({
      rps: Number(field<HTMLInputElement>('rps')?.value ?? 300),
      cache: field<HTMLInputElement>('cache')?.checked ?? false,
      failure,
    });
    const out = field<HTMLOutputElement>('rpsOut');
    if (out) out.value = String(sim.config.rps);
    const reps = field<HTMLOutputElement>('replicasOut');
    if (reps) reps.value = String(sim.config.replicas);
  }

  // A plain-language summary a few seconds after a change, once the numbers settle.
  let announce = 0;
  const scheduleSummary = () => {
    clearTimeout(announce);
    announce = window.setTimeout(() => {
      const m = sim.metrics();
      const c = sim.config;
      summary.textContent =
        `At ${c.rps} requests per second with ${c.replicas} ${c.replicas === 1 ? 'replica' : 'replicas'}` +
        `${c.cache ? ' and a cache' : ''}: p95 latency ${ms(m.p95)}, ${pct(m.errorRate)} errors, ` +
        `${Math.round(m.throughput)} successful responses per second.`;
    }, 3000);
  };

  form.addEventListener('input', () => {
    readControls();
    scheduleSummary();
  });
  form.addEventListener('submit', (e) => e.preventDefault());
  for (const b of form.querySelectorAll<HTMLButtonElement>('[data-step]')) {
    b.addEventListener('click', () => {
      sim.set({ replicas: sim.config.replicas + Number(b.dataset.step) });
      readControls();
      scheduleSummary();
    });
  }
  el.querySelector('[data-reset]')?.addEventListener('click', () => {
    form.reset();
    sim = createSim({}, ++seed);
    readControls();
    scene?.reset(sim);
    summary.textContent = 'Reset to 300 requests per second, 2 replicas, no cache and no failure.';
  });

  let sinceDom = 1;
  function updateDom() {
    const m = sim.metrics();
    const set = (name: string, text: string) => {
      const node = metric(name);
      if (node && node.textContent !== text) node.textContent = text;
    };
    set('p95', ms(m.p95));
    set('throughput', String(Math.round(m.throughput)));
    set('errors', pct(m.errorRate));
    set('db', pct(m.dbUtilisation));
    set('queue', `${m.queueDepth} ${m.queueDepth === 1 ? 'job' : 'jobs'}`);
    const items = m.replicas.map((r, i) => {
      const state = !r.up
        ? r.routed
          ? 'down, still receiving traffic'
          : 'down, removed by the health check'
        : 'up';
      return `Replica ${i + 1}: ${state}; ${r.busy} of ${MODEL.workers} workers busy, ${r.queued} queued`;
    });
    if (list && list.childElementCount !== items.length)
      list.replaceChildren(...items.map(() => document.createElement('li')));
    items.forEach((text, i) => {
      const li = list?.children[i];
      if (li && li.textContent !== text) li.textContent = text;
    });
  }

  const loop = createLoop(el, (dt) => {
    sim.advance(dt * 1000);
    const hops = sim.drainHops();
    scene?.update(dt, hops, sim);
    sinceDom += dt;
    if (sinceDom > 0.25) {
      sinceDom = 0;
      updateDom();
    }
  });
  pause.addEventListener('click', () => {
    loop.setPaused(!loop.paused);
    pause.textContent = loop.paused ? 'Play' : 'Pause';
  });

  readControls();
  updateDom();
  loop.start();

  const tier = await tierReady();
  if (tier !== 'poster') {
    const { createScaleScene } = await import('./system-scene');
    scene = await createScaleScene(view, sim);
  }
  el.dataset.view3d = scene ? 'on' : 'off';
}
