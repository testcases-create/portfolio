// Boot code: runs once per visit and survives client-side navigation. It owns
// the theme and pause preferences and mirrors each page's world config onto
// <html> for the engine (Phase 2) and for Playwright.
import { KEYS, readPaused, readTheme, write, type Theme } from '../lib/preferences';
import { readConfig } from '../lib/world-config';

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
  root.dataset.worldFormation = formation;
  root.dataset.worldMode = mode;
  root.dataset.worldTier ??= 'pending';
  root.dataset.worldReady ??= 'false';

  for (const button of document.querySelectorAll<HTMLButtonElement>('[data-action="theme"]')) {
    button.setAttribute('aria-pressed', String(theme === 'light'));
  }
  for (const button of document.querySelectorAll<HTMLButtonElement>('[data-action="pause"]')) {
    button.setAttribute('aria-pressed', String(paused));
  }
}

document.addEventListener('click', (event) => {
  const target = event.target;
  if (!(target instanceof Element)) return;
  const action = target.closest<HTMLElement>('[data-action]')?.dataset.action;
  if (action === 'theme') {
    theme = theme === 'dark' ? 'light' : 'dark';
    write(store, KEYS.theme, theme);
    root.dispatchEvent(new CustomEvent('world:theme', { detail: theme }));
  } else if (action === 'pause') {
    paused = !paused;
    write(store, KEYS.paused, paused ? '1' : '0');
    root.dispatchEvent(new CustomEvent('world:pause', { detail: paused }));
  } else {
    return;
  }
  applyState();
});

// The router swaps <html> attributes for the incoming page's; restore ours
// before it paints.
document.addEventListener('astro:after-swap', applyState);
applyState();
