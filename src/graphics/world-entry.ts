// The world controller: started once per visit, after first paint, by
// src/scripts/boot.ts. It owns everything that must survive a page navigation
// or a tier switch, and it is the only code that talks to the DOM:
// - reads each page's config from <body data-world-*> and its scroll sections;
// - mirrors state onto <html data-world-*> for CSS and Playwright;
// - pauses completely when paused, hidden, or scrolled off-screen.
import { CAPTIONS, STORAGE_TIER_KEY, readConfig } from '../lib/world-config';
import { bindScroll } from './choreography';
import { formationIndex } from './weights';
import type { FormationName } from './formations';
import { assembleProgress } from './intro-state';
import { oneHot, type SimInputs } from './sim.shared';
import { readTheme } from './theme';
import { chooseTier, isTier, nextTier, type Tier } from './tiers';
import { createWorld, type ExploreView, type SharedState, type WorldHandle } from './world';
import { FORMATION_NAMES } from './formations';

const root = document.documentElement;

async function hasWebGPU(): Promise<boolean> {
  try {
    const gpu = (
      navigator as Navigator & {
        gpu?: { requestAdapter(): Promise<{ info?: { isFallbackAdapter?: boolean } } | null> };
      }
    ).gpu;
    const adapter = await gpu?.requestAdapter();
    // A software fallback adapter can't hold the high tier's frame rate.
    return !!adapter && adapter.info?.isFallbackAdapter !== true;
  } catch {
    return false;
  }
}

function forcedTier(): string | null {
  const fromUrl = new URLSearchParams(location.search).get('tier');
  if (fromUrl) return fromUrl;
  try {
    return localStorage.getItem(STORAGE_TIER_KEY);
  } catch {
    return null;
  }
}

async function detectTier(): Promise<Tier> {
  const forced = forcedTier();
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const saveData =
    (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData === true;
  if (isTier(forced) || reducedMotion || saveData) {
    return chooseTier({ forced, reducedMotion, saveData, webgpu: false, webgl2: false });
  }
  const webgl2 = !!document.createElement('canvas').getContext('webgl2');
  return chooseTier({ forced, reducedMotion, saveData, webgpu: await hasWebGPU(), webgl2 });
}

let started = false;

/** Hooks the architecture explorer passes in: fill the graph slot, and put it back. */
export interface ExploreHooks {
  apply(form: Float32Array, n: number): void;
  restore(form: Float32Array, n: number): void;
}

/** The explorer's handle on the running world (src/graphics/explorer.ts). */
export interface WorldExplorer {
  enter(hooks: ExploreHooks, view: ExploreView): void;
  /** The focus or flow changed: rewrite the graph slot. */
  update(): void;
  exit(): void;
  project(p: readonly [number, number, number]): { x: number; y: number } | null;
  tier(): Tier;
}

let resolveExplorer: (api: WorldExplorer) => void = () => {};
/** Resolves once the world has mounted its first tier. */
export const worldExplorer = new Promise<WorldExplorer>((resolve) => (resolveExplorer = resolve));

export async function startWorld(): Promise<void> {
  if (started) return;
  started = true;
  const host = document.getElementById('world');
  if (!host) return;

  const config = readConfig(document.body.dataset);
  const initial = oneHot(formationIndex(config.formation));
  const state: SharedState = {
    time: 0,
    frozen: false,
    explore: null,
    weights: [...initial],
    targetWeights: [...initial],
    mode: config.mode,
    pointer: { x: 0, y: 0, tx: 0, ty: 0, until: 0 },
    camera: null,
    theme: readTheme(root),
    assemble: () => assembleProgress(root),
  };

  let world: WorldHandle | null = null;
  let tier: Tier = await detectTier();
  let running = false;
  let onScreen = true;
  let probeNote = '';
  // Scroll sets the formation, except while the explorer holds the world.
  let scrollWeights = [...initial];
  const onScroll = (w: number[]) => {
    scrollWeights = w;
    if (!state.explore) state.targetWeights = w;
  };
  let unbindScroll = bindScroll(formationIndex(config.formation), onScroll);
  let exploring: ExploreHooks | null = null;
  let restoreTimer = 0;

  const caption = () => document.getElementById('world-caption');
  let shown: FormationName = 'data';
  const setFormation = (name: FormationName) => {
    shown = name;
    if (state.explore) {
      root.dataset.worldFormation = 'graph';
      return;
    }
    root.dataset.worldFormation = name;
    const c = CAPTIONS[name];
    const el = caption();
    if (el) {
      el.textContent = c.text;
      if (c.area) el.dataset.area = c.area;
      else delete el.dataset.area;
    }
  };

  function sync() {
    const paused = root.dataset.worldPaused === 'true';
    // Paused while exploring: keep drawing so the camera can move, with time frozen.
    state.frozen = paused;
    const shouldRun = !!world && (!paused || !!state.explore) && !document.hidden && onScreen;
    if (shouldRun && !running) world?.start();
    if (!shouldRun && running) world?.stop();
    running = shouldRun;
    root.dataset.worldRunning = String(running);
  }

  async function mount(next: Tier) {
    const previous = world;
    world = null;
    running = false;
    if (previous) {
      previous.dispose();
      // Let the browser release the old GPU device before asking for a new context;
      // requesting WebGL2 in the same task as a WebGPU teardown can return null.
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    tier = next;
    root.dataset.worldTier = tier;
    if (tier === 'poster') {
      root.dataset.worldBackend = 'none';
      root.dataset.worldReady = 'true';
      setFormation(
        (['data', 'ml', 'llm', 'sde', 'converge'] as const)[state.targetWeights.indexOf(1)] ?? 'data',
      );
      sync();
      return;
    }
    try {
      const particles = Number(new URLSearchParams(location.search).get('particles')) || undefined;
      world = await createWorld(host as HTMLElement, tier, state, {
        onStepDown: (note) => {
          probeNote = `${note}, stepped down`;
          if (!isTier(forcedTier())) void mount(nextTier(tier));
        },
        onFailure: (error) => {
          console.error(`World: the ${tier} tier failed while running.`, error);
          probeNote = `${tier} failed while running, stepped down`;
          void mount(nextTier(tier));
        },
        onFormation: setFormation,
        ...(particles ? { particles } : {}),
      });
      root.dataset.worldBackend = tier === 'low' ? 'cpu' : world.backend;
      root.dataset.worldReady = 'true';
      applyExplore();
    } catch (error) {
      console.error(`World: the ${tier} tier failed to start.`, error);
      probeNote = `${tier} failed`;
      await mount(nextTier(tier));
      return;
    }
    sync();
  }

  // Band mode (project pages): pause while the band is scrolled off-screen.
  const observer = new IntersectionObserver((entries) => {
    onScreen = entries.some((e) => e.isIntersecting);
    sync();
  });
  observer.observe(host);

  addEventListener('resize', () => world?.resize());
  document.addEventListener('visibilitychange', sync);
  root.addEventListener('world:pause', sync);
  root.addEventListener('world:theme', () => {
    state.theme = readTheme(root);
    world?.applyTheme();
  });
  root.addEventListener('world:tier', () => void detectTier().then(mount));
  addEventListener(
    'pointermove',
    (e) => {
      state.pointer.tx = (e.clientX / innerWidth) * 2 - 1;
      state.pointer.ty = -(e.clientY / innerHeight) * 2 + 1;
      state.pointer.until = performance.now() + 1200;
    },
    { passive: true },
  );

  // Page transitions: a click on a link with data-area starts the morph toward
  // that area's formation while the next page loads.
  document.addEventListener('astro:before-preparation', (event) => {
    const source = (event as Event & { sourceElement?: Element }).sourceElement;
    const area = source?.closest<HTMLElement>('[data-area]')?.dataset.area;
    if (area) state.targetWeights = oneHot(formationIndex(area));
  });
  document.addEventListener('astro:after-swap', () => {
    const next = readConfig(document.body.dataset);
    unbindScroll();
    unbindScroll = bindScroll(formationIndex(next.formation), onScroll);
    if (next.mode !== state.mode) {
      state.mode = next.mode;
      requestAnimationFrame(() => world?.resize());
    }
    setFormation((root.dataset.worldFormation as FormationName | undefined) ?? 'data');
  });

  // Stats for nerds: publish a snapshot while the panel is open.
  setInterval(() => {
    if (document.getElementById('world-stats')?.hidden !== false) return;
    const s = world?.stats();
    root.dispatchEvent(
      new CustomEvent('world:stats', {
        detail: {
          FPS: s ? s.fps.toFixed(0) : '–',
          'Frame time': s ? `${s.frameMs.toFixed(1)} ms` : '–',
          'GPU time': s?.gpuMs != null ? `${s.gpuMs.toFixed(2)} ms` : 'not available',
          Particles: world ? world.particles.toLocaleString('en') : '0',
          Tier: tier,
          Backend: root.dataset.worldBackend ?? '–',
          'Draw calls': s ? String(s.drawCalls) : '0',
          'Compute passes': s ? String(s.computeCalls) : '0',
          'Render scale': s ? `${s.renderScale.toFixed(2)}×` : '–',
          Bloom: s?.bloom ?? '–',
          Probe: probeNote || s?.probe || '–',
        },
      }),
    );
  }, 250);

  // Test hook, only with ?world-debug in the URL: lets Playwright step the GPU
  // kernel once and compare it with the CPU specification.
  if (new URLSearchParams(location.search).has('world-debug')) {
    Object.assign(window, {
      __world: {
        state,
        step: (input: SimInputs) => world?.debugStep(input),
        stop: () => {
          world?.stop();
          running = false;
          root.dataset.worldRunning = 'false';
        },
      },
    });
  }

  function applyExplore() {
    if (!world || !exploring) return;
    exploring.apply(world.formation(), world.particles);
    world.formationChanged();
  }

  await mount(tier);
  resolveExplorer({
    enter(hooks, view) {
      clearTimeout(restoreTimer);
      exploring = hooks;
      state.explore = view;
      state.targetWeights = oneHot(FORMATION_NAMES.indexOf('sde'));
      root.dataset.worldExplore = 'true';
      root.dataset.worldFormation = 'graph';
      applyExplore();
      world?.resize();
      sync();
    },
    update: applyExplore,
    exit() {
      const hooks = exploring;
      exploring = null;
      state.explore = null;
      state.targetWeights = scrollWeights;
      delete root.dataset.worldExplore;
      setFormation(shown);
      world?.resize();
      sync();
      // Put the SDE formation back once the world has morphed away from it
      // (at once when the page itself shows SDE, so the graph springs back into it).
      const restore = () => {
        if (!world || !hooks || exploring) return;
        hooks.restore(world.formation(), world.particles);
        world.formationChanged();
      };
      const stays = (scrollWeights[FORMATION_NAMES.indexOf('sde')] ?? 0) > 0.5;
      if (stays) restore();
      else restoreTimer = window.setTimeout(restore, 1500);
    },
    project: (p) => world?.project(p) ?? null,
    tier: () => tier,
  });
}
