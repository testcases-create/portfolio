// Deep-dive enhancements, re-applied on every page view (the client router
// keeps this module loaded): the Skim/Full toggle, remembered across projects,
// and the current section highlighted in the "On this page" list.
import { read, write } from '../lib/preferences';

const VIEW_KEY = 'pref:view';
const store = (() => {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
})();

let observer: IntersectionObserver | null = null;

function setView(article: HTMLElement, view: 'skim' | 'full') {
  article.dataset.view = view;
  for (const b of article.querySelectorAll<HTMLButtonElement>('[data-view-choice]')) {
    b.setAttribute('aria-pressed', String(b.dataset.viewChoice === view));
  }
}

function init() {
  observer?.disconnect();
  const article = document.querySelector<HTMLElement>('.deep-dive');
  if (!article) return;

  // The toggle only means something with JavaScript, so it starts hidden.
  article.querySelector<HTMLElement>('.view-toggle')?.removeAttribute('hidden');
  setView(article, read(store, VIEW_KEY) === 'skim' ? 'skim' : 'full');

  const links = new Map(
    [...document.querySelectorAll<HTMLAnchorElement>('.toc-wide a')].map((a) => [a.hash.slice(1), a]),
  );
  observer = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        for (const a of links.values()) a.removeAttribute('aria-current');
        links.get(e.target.id)?.setAttribute('aria-current', 'location');
      }
    },
    { rootMargin: '-20% 0px -70% 0px' },
  );
  for (const id of links.keys()) {
    const section = document.getElementById(id);
    if (section) observer.observe(section);
  }
}

document.addEventListener('click', (event) => {
  const button = (event.target as Element | null)?.closest<HTMLButtonElement>('[data-view-choice]');
  const article = button?.closest<HTMLElement>('.deep-dive');
  if (!button || !article) return;
  const view = button.dataset.viewChoice === 'skim' ? 'skim' : 'full';
  setView(article, view);
  write(store, VIEW_KEY, view);
});

document.addEventListener('astro:page-load', init);
