// The Lab page: each demo loads only when its "Open" button is pressed
// (BRIEF.md 8). The buttons need JavaScript, so they start hidden.
const demos: Record<string, () => Promise<{ mount(el: HTMLElement): Promise<void> }>> = {
  'train-network': () => import('../lab/train-network/train-network'),
  'watch-attention': () => import('../lab/watch-attention/watch-attention'),
  'scale-system': () => import('../lab/scale-system/scale-system'),
};

function init() {
  for (const b of document.querySelectorAll<HTMLButtonElement>('[data-demo-open]')) b.hidden = false;
  for (const p of document.querySelectorAll<HTMLElement>('[data-needs-js]')) p.hidden = true;
}

document.addEventListener('click', (event) => {
  const button = (event.target as Element | null)?.closest<HTMLButtonElement>('[data-demo-open]');
  const name = button?.dataset.demoOpen;
  const el = name ? document.querySelector<HTMLElement>(`[data-demo="${name}"]`) : null;
  const load = name ? demos[name] : undefined;
  if (!button || !el || !load) return;
  button.disabled = true;
  button.textContent = 'Loading…';
  void load()
    .then(({ mount }) => {
      el.hidden = false;
      button.hidden = true;
      el.querySelector<HTMLElement>('input, button, select, [tabindex]')?.focus({ preventScroll: true });
      return mount(el);
    })
    .catch((error: unknown) => {
      console.error(`Lab: ${name} failed to load.`, error);
      button.disabled = false;
      button.textContent = 'Try again';
    });
});

document.addEventListener('astro:page-load', init);

export {};
