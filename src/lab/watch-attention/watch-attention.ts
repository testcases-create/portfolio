// "Watch attention": loads the precomputed attention (public/lab/attention.json),
// fills the controls, and shows where the chosen token looks, as a ranked
// list and, when the tier allows, as 3D arcs (attention-scene.ts).
import { createLoop, tierReady } from '../shared/loop';
import {
  attention,
  decodeSentence,
  describeHead,
  display,
  topK,
  type AttentionFile,
  type Sentence,
} from './logic';

const fromBase64 = (text: string) => Uint8Array.from(atob(text), (c) => c.charCodeAt(0));

export async function mount(el: HTMLElement): Promise<void> {
  const form = el.querySelector<HTMLFormElement>('[data-controls]');
  const view = el.querySelector<HTMLElement>('[data-view]');
  const tokensEl = el.querySelector<HTMLElement>('[data-tokens]');
  const top = el.querySelector<HTMLOListElement>('[data-top]');
  const describe = el.querySelector<HTMLElement>('[data-describe]');
  const heading = el.querySelector<HTMLElement>('[data-heading]');
  const source = el.querySelector<HTMLElement>('[data-source]');
  const stepButton = el.querySelector<HTMLButtonElement>('[data-step]');
  if (!form || !view || !tokensEl || !top || !describe || !heading || !source || !stepButton) return;
  const select = (name: string) => form.elements.namedItem(name) as HTMLSelectElement;

  const file = (await (await fetch('/lab/attention.json')).json()) as AttentionFile & { note?: string };
  const sentences: Sentence[] = file.sentences.map((s) =>
    decodeSentence(s, file.layers, file.heads, fromBase64),
  );
  if (file.source === 'sample') {
    source.hidden = false;
    source.textContent =
      'Sample data: these patterns come from simple rules, not from a model. ' +
      'The real attention of distilgpt2 replaces them once scripts/precompute-attention.py has run.';
  }

  const option = (value: string, text: string) =>
    Object.assign(document.createElement('option'), { value, text });
  select('sentence').replaceChildren(...sentences.map((s, i) => option(String(i), s.text)));
  select('layer').replaceChildren(
    option('all', 'All layers (average)'),
    ...Array.from({ length: file.layers }, (_, i) => option(String(i), `Layer ${i + 1}`)),
  );
  select('head').replaceChildren(
    option('all', 'All heads (average)'),
    ...Array.from({ length: file.heads }, (_, i) => option(String(i), `Head ${i + 1}`)),
  );
  select('layer').value = String(Math.min(2, file.layers - 1));
  select('head').value = 'all';

  const state = { sentence: 0, layer: select('layer').value, head: 'all', query: 0 };
  const num = (v: string) => (v === 'all' ? null : Number(v));
  const current = () => sentences[state.sentence] as Sentence;
  const row = () => attention(current(), num(state.layer), num(state.head), state.query);

  let scene: Awaited<ReturnType<typeof import('./attention-scene').createAttentionScene>> = null;

  function renderTokens() {
    const s = current();
    tokensEl?.replaceChildren(
      ...s.tokens.map((t, i) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = display(t);
        b.dataset.index = String(i);
        b.setAttribute('aria-pressed', String(i === state.query));
        b.setAttribute('aria-label', `Token ${i + 1}: ${display(t)}`);
        return b;
      }),
    );
  }

  function render() {
    const s = current();
    for (const b of tokensEl?.querySelectorAll<HTMLButtonElement>('button') ?? [])
      b.setAttribute('aria-pressed', String(Number(b.dataset.index) === state.query));
    const r = row();
    const q = display(s.tokens[state.query] ?? '');
    const where = `${state.layer === 'all' ? 'all layers' : `layer ${Number(state.layer) + 1}`}, ${
      state.head === 'all' ? 'all heads' : `head ${Number(state.head) + 1}`
    }`;
    if (heading) heading.textContent = `Where “${q}” looks (${where})`;
    top?.replaceChildren(
      ...topK(r, Math.min(5, r.length)).map(([k, w]) => {
        const li = document.createElement('li');
        const name = document.createElement('span');
        name.textContent = `${display(s.tokens[k] ?? '')}${k === state.query ? ' (itself)' : ''}`;
        const bar = document.createElement('span');
        bar.className = 'bar';
        bar.style.width = `${Math.max(1, w * 100)}%`;
        bar.setAttribute('aria-hidden', 'true');
        const value = document.createElement('span');
        value.className = 'value';
        value.textContent = `${Math.round(w * 100)}%`;
        li.append(name, bar, value);
        return li;
      }),
    );
    if (describe)
      describe.textContent =
        state.query === 0
          ? 'The first token can only look at itself. Choose a later token.'
          : `This ${state.head === 'all' ? 'average' : 'head'}: ${describeHead(s, num(state.layer), num(state.head)).replace(/^./, (c) => c.toLowerCase())}`;
    scene?.show(s, r, state.query);
  }

  form.addEventListener('submit', (e) => e.preventDefault());
  form.addEventListener('change', (e) => {
    const t = e.target as HTMLSelectElement;
    if (t.name === 'sentence') {
      state.sentence = Number(t.value);
      state.query = current().tokens.length - 1;
      renderTokens();
    } else if (t.name === 'layer') state.layer = t.value;
    else if (t.name === 'head') state.head = t.value;
    render();
  });
  tokensEl.addEventListener('click', (e) => {
    const b = (e.target as Element).closest<HTMLButtonElement>('button[data-index]');
    if (!b) return;
    state.query = Number(b.dataset.index);
    render();
  });

  // "Step through the layers": one layer every 1.6 s, for the chosen head.
  let stepping = false;
  let since = 0;
  const loop = createLoop(el, (dt) => {
    if (stepping) {
      since += dt;
      if (since > 1.6) {
        since = 0;
        const next = state.layer === 'all' ? 0 : (Number(state.layer) + 1) % file.layers;
        state.layer = String(next);
        select('layer').value = state.layer;
        render();
      }
    }
    scene?.update(dt);
  });
  stepButton.addEventListener('click', () => {
    stepping = !stepping;
    since = 1.6;
    stepButton.textContent = stepping ? 'Stop stepping' : 'Step through the layers';
    // Don't announce every step to a screen reader; the list is there to read.
    describe.setAttribute('aria-live', stepping ? 'off' : 'polite');
  });

  state.query = current().tokens.length - 1;
  renderTokens();
  render();
  loop.start();

  const tier = await tierReady();
  if (tier !== 'poster') {
    const { createAttentionScene } = await import('./attention-scene');
    scene = await createAttentionScene(view);
    render();
  }
  el.dataset.view3d = scene ? 'on' : 'off';
}
