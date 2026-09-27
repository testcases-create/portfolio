// Presentation mode: one slide at a time. Arrow keys, Page Up/Down, Space,
// Home/End, clicks on the slide, and the buttons all move; Escape exits.
// The slide number lives in the URL hash, so a refresh keeps your place.

let index = 0;
let slides: HTMLElement[] = [];

function show(i: number) {
  index = Math.max(0, Math.min(slides.length - 1, i));
  slides.forEach((s, j) => s.toggleAttribute('data-active', j === index));
  const counter = document.querySelector('[data-counter]');
  if (counter) counter.textContent = `${index + 1} / ${slides.length}`;
  history.replaceState(null, '', `#${index + 1}`);
}

function onKey(e: KeyboardEvent) {
  if (!slides.length || e.metaKey || e.ctrlKey || e.altKey) return;
  const moves: Record<string, number> = {
    ArrowRight: 1,
    ArrowDown: 1,
    PageDown: 1,
    ' ': 1,
    ArrowLeft: -1,
    ArrowUp: -1,
    PageUp: -1,
  };
  if (e.key in moves) {
    e.preventDefault();
    show(index + (moves[e.key] ?? 0));
  } else if (e.key === 'Home') show(0);
  else if (e.key === 'End') show(slides.length - 1);
  else if (e.key === 'Escape') document.querySelector<HTMLAnchorElement>('[data-deck-controls] a')?.click();
}

function onClick(e: MouseEvent) {
  const target = e.target as Element;
  const button = target.closest<HTMLElement>('[data-slide]');
  if (button) return show(index + (button.dataset.slide === 'next' ? 1 : -1));
  // A click on the slide itself (not a link or code) advances.
  if (target.closest('.slide') && !target.closest('a, pre, button, summary')) show(index + 1);
}

function init() {
  const deck = document.querySelector('[data-deck]');
  document.documentElement.classList.toggle('deck-js', !!deck);
  if (!deck) {
    slides = [];
    return;
  }
  slides = [...deck.querySelectorAll<HTMLElement>('.slide')];
  document.querySelector('[data-deck-controls]')?.removeAttribute('hidden');
  show(Number(location.hash.slice(1)) - 1 || 0);
}

document.addEventListener('keydown', onKey);
document.addEventListener('click', onClick);
document.addEventListener('astro:page-load', init);
