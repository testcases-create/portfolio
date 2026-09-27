// What every Lab demo needs without three.js: the world's tier decision and a
// frame loop that stops while the demo is off-screen, the tab is hidden, or
// the visitor pauses it. Kept apart from stage.ts so a demo on the poster tier
// never downloads three.js.
const root = document.documentElement;

/** Waits until the world has picked its tier; the Lab follows the same decision. */
export function tierReady(): Promise<string> {
  const read = () => root.dataset.worldTier ?? 'poster';
  if (root.dataset.worldReady === 'true') return Promise.resolve(read());
  return new Promise((resolve) => {
    const observer = new MutationObserver(() => {
      if (root.dataset.worldReady !== 'true') return;
      observer.disconnect();
      resolve(read());
    });
    observer.observe(root, { attributes: true, attributeFilter: ['data-world-ready'] });
  });
}

export const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * A demo's frame loop: runs `frame(dt)` each animation frame while the demo is
 * on-screen, the tab is visible and the visitor hasn't paused it. It runs with
 * or without a 3D view, since the simulation and the DOM view need it too.
 */
export function createLoop(host: HTMLElement, frame: (dt: number) => void) {
  let paused = false;
  let visible = true;
  let handle = 0;
  let last = 0;
  let stopped = false;
  const tick = (now: number) => {
    const dt = last ? Math.min(0.1, (now - last) / 1000) : 1 / 60;
    last = now;
    frame(dt);
    handle = requestAnimationFrame(tick);
  };
  const sync = () => {
    const run = !stopped && !paused && visible && !document.hidden;
    if (run && !handle) {
      last = 0;
      handle = requestAnimationFrame(tick);
    } else if (!run && handle) {
      cancelAnimationFrame(handle);
      handle = 0;
    }
  };
  const observer = new IntersectionObserver((entries) => {
    visible = entries.some((e) => e.isIntersecting);
    sync();
  });
  observer.observe(host);
  document.addEventListener('visibilitychange', sync);
  return {
    get paused() {
      return paused;
    },
    setPaused(value: boolean) {
      paused = value;
      sync();
    },
    start: sync,
    dispose() {
      stopped = true;
      sync();
      observer.disconnect();
      document.removeEventListener('visibilitychange', sync);
    },
  };
}
