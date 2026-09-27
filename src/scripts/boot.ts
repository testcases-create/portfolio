// Boot code: runs once per visit and survives client-side navigation. It owns
// the theme, pause and tier preferences, mirrors each page's world config onto
// <html>, and loads the graphics engine after first paint. Everything here
// counts toward the 50 KB initial budget, so the engine itself is a dynamic import.
import { KEYS, readPaused, readTheme, write, type Theme } from '../lib/preferences';
import { posterReason, readRenderer } from '../lib/gpu-check';
import { STORAGE_TIER_KEY, readConfig } from '../lib/world-config';

const root = document.documentElement;
const store = (() => {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
})();

let theme: Theme = readTheme(store);
let paused = readPaused(store);

function applyState(): void {
  root.dataset.theme = theme;
  root.dataset.worldPaused = String(paused);
  const { formation, mode } = readConfig(document.body.dataset);
  root.dataset.worldMode = mode;
  // The running engine mirrors the formation it shows; without it, mirror the page's.
  if (!root.dataset.worldBackend || root.dataset.worldBackend === 'none')
    root.dataset.worldFormation = formation;
  root.dataset.worldTier ??= 'pending';
  root.dataset.worldReady ??= 'false';

  for (const button of document.querySelectorAll<HTMLButtonElement>('[data-action="theme"]')) {
    button.setAttribute('aria-pressed', String(theme === 'light'));
  }
  for (const button of document.querySelectorAll<HTMLButtonElement>('[data-action="pause"]')) {
    button.setAttribute('aria-pressed', String(paused));
  }
  const select = document.querySelector<HTMLSelectElement>('#world-tier');
  if (select) select.value = storedTier() ?? 'auto';
}

function storedTier(): string | null {
  try {
    return store?.getItem(STORAGE_TIER_KEY) ?? null;
  } catch {
    return null;
  }
}

document.addEventListener('click', (event) => {
  const target = event.target;
  if (!(target instanceof Element)) return;
  const button = target.closest<HTMLElement>('[data-action]');
  const action = button?.dataset.action;
  if (action === 'theme') {
    theme = theme === 'dark' ? 'light' : 'dark';
    write(store, KEYS.theme, theme);
    applyState();
    root.dispatchEvent(new CustomEvent('world:theme', { detail: theme }));
  } else if (action === 'pause') {
    paused = !paused;
    write(store, KEYS.paused, paused ? '1' : '0');
    applyState();
    root.dispatchEvent(new CustomEvent('world:pause', { detail: paused }));
  } else if (action === 'stats' && button) {
    const panel = document.getElementById('world-stats');
    if (!panel) return;
    panel.hidden = !panel.hidden;
    button.setAttribute('aria-expanded', String(!panel.hidden));
    renderStats();
  }
});

document.addEventListener('change', (event) => {
  const select = event.target;
  if (!(select instanceof HTMLSelectElement) || select.id !== 'world-tier') return;
  try {
    if (select.value === 'auto') store?.removeItem(STORAGE_TIER_KEY);
    else store?.setItem(STORAGE_TIER_KEY, select.value);
  } catch {
    // Applies to this visit only.
  }
  root.dispatchEvent(new CustomEvent('world:tier', { detail: select.value }));
});

// Stats for nerds: the engine publishes a snapshot; boot renders it, so the
// panel also works on the poster tier, where the engine never loads.
let lastStats: Record<string, string> = {};
root.addEventListener('world:stats', (event) => {
  lastStats = (event as CustomEvent<Record<string, string>>).detail;
  renderStats();
});

function graphicsBytes(): number {
  return performance
    .getEntriesByType('resource')
    .filter(
      (e) => /\/_astro\/.*(three|world|ScrollTrigger|poster)/i.test(e.name) || /\/poster\//.test(e.name),
    )
    .reduce((sum, e) => sum + ((e as PerformanceResourceTiming).transferSize || 0), 0);
}

function renderStats(): void {
  const list = document.querySelector('#world-stats dl');
  if (!list || document.getElementById('world-stats')?.hidden) return;
  const rows: Record<string, string> = {
    Tier: root.dataset.worldTier ?? '–',
    Backend: root.dataset.worldBackend ?? '–',
    ...(root.dataset.worldPosterReason && { 'Poster because': root.dataset.worldPosterReason }),
    ...lastStats,
    'Graphics bytes transferred': `${(graphicsBytes() / 1000).toFixed(0)} KB`,
  };
  list.replaceChildren(
    ...Object.entries(rows).flatMap(([k, v]) => {
      const dt = document.createElement('dt');
      const dd = document.createElement('dd');
      dt.textContent = k;
      dd.textContent = v;
      return [dt, dd];
    }),
  );
}

// The router swaps <html> attributes for the incoming page's; restore ours
// before it paints.
document.addEventListener('astro:after-swap', applyState);
applyState();

/**
 * Runs `fn` once the browser reports its first contentful paint (or after 1 s,
 * for a tab that never paints, such as one opened in the background).
 * requestAnimationFrame is not enough: it runs before that frame is painted.
 */
function afterFirstPaint(fn: () => void): void {
  let done = false;
  const go = () => {
    if (done) return;
    done = true;
    fn();
  };
  try {
    new PerformanceObserver((list, observer) => {
      if (!list.getEntriesByName('first-contentful-paint').length) return;
      observer.disconnect();
      go();
    }).observe({ type: 'paint', buffered: true });
  } catch {
    // No paint timing in this browser: the timeout below starts it.
  }
  setTimeout(go, 1000);
}

// The hero intro: only on a page that has one, once per session, never with
// reduced motion. Its chunk (GSAP and SplitText, about 30 KB) is requested
// just after the first paint rather than straight away, so on a slow
// connection it doesn't compete with the CSS and fonts the hero text needs.
// The headline is already on screen as a ghost, so nothing waits for it.
if (root.classList.contains('intro') && document.querySelector('[data-world-intro]')) {
  afterFirstPaint(() => void import('../graphics/intro').then(({ runIntro }) => runIntro()));
} else {
  root.classList.remove('intro');
}

// The engine loads after first paint. Visitors who asked for less motion or
// less data, or whose browser has no usable GPU, get the poster without
// downloading any graphics code.
function startGraphics(): void {
  const reason = posterReason({
    forced: new URLSearchParams(location.search).get('tier') ?? storedTier(),
    reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
    saveData:
      (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData === true,
    renderer: readRenderer(),
  });
  if (reason) {
    root.dataset.worldTier = 'poster';
    root.dataset.worldBackend = 'none';
    root.dataset.worldPosterReason = reason;
    root.dataset.worldReady = 'true';
    return;
  }
  // Presentation mode hides the world: wait for the first page that shows it.
  if (readConfig(document.body.dataset).mode === 'off') {
    document.addEventListener('astro:after-swap', startGraphics, { once: true });
    return;
  }
  void import('../graphics/world-entry').then(({ startWorld }) => startWorld());
}

const whenIdle = (fn: () => void) =>
  'requestIdleCallback' in window ? requestIdleCallback(fn, { timeout: 1500 }) : setTimeout(fn, 200);
if (document.readyState === 'complete') whenIdle(startGraphics);
else addEventListener('load', () => whenIdle(startGraphics), { once: true });
