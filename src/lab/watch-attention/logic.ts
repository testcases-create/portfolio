// "Watch attention" (BRIEF.md 5, the Lab): reading precomputed attention.
//
// public/lab/attention.json is written by scripts/precompute-attention.py from
// a small open model (distilgpt2). For each sentence, layer, head and query
// token it stores the attention over that token and the tokens before it
// (a causal model never looks ahead), quantised to one byte per weight and
// base64-encoded. Until the script has been run, the file holds sample data
// from scripts/sample-attention.ts, marked `"source": "sample"`; the page says
// so, and a production build fails on it (scripts/content-audit.ts).

export interface AttentionFile {
  model: string;
  /** "model" when computed by the script, "sample" for the rule-based stand-in. */
  source: 'model' | 'sample';
  layers: number;
  heads: number;
  sentences: { text: string; tokens: string[]; attention: string }[];
}

/** Bytes for one sentence: every layer and head, query by query, keys 0..query. */
export const triangle = (tokens: number) => (tokens * (tokens + 1)) / 2;

/** Quantises rows of weights to one byte each; decodeSentence renormalises each row after rounding. */
export function encode(rows: number[][], toBase64: (bytes: Uint8Array) => string): string {
  const bytes = new Uint8Array(rows.reduce((n, r) => n + r.length, 0));
  let i = 0;
  for (const row of rows) for (const w of row) bytes[i++] = Math.max(0, Math.min(255, Math.round(w * 255)));
  return toBase64(bytes);
}

export interface Sentence {
  text: string;
  tokens: string[];
  layers: number;
  heads: number;
  /** Attention of `query` over keys 0..query, for one layer and head. */
  row(layer: number, head: number, query: number): Float32Array;
}

export function decodeSentence(
  s: AttentionFile['sentences'][number],
  layers: number,
  heads: number,
  fromBase64: (text: string) => Uint8Array,
): Sentence {
  const bytes = fromBase64(s.attention);
  const T = s.tokens.length;
  const per = triangle(T);
  if (bytes.length !== per * layers * heads) {
    throw new Error(`"${s.text}": expected ${per * layers * heads} bytes, found ${bytes.length}`);
  }
  return {
    text: s.text,
    tokens: s.tokens,
    layers,
    heads,
    row(layer, head, query) {
      const start = (layer * heads + head) * per + triangle(query);
      const out = new Float32Array(query + 1);
      let sum = 0;
      for (let k = 0; k <= query; k++) sum += out[k] = (bytes[start + k] ?? 0) / 255;
      // Undo rounding drift so a row sums to exactly 1.
      if (sum > 0) for (let k = 0; k <= query; k++) out[k] = (out[k] ?? 0) / sum;
      return out;
    },
  };
}

/** A layer and head, or the mean over layers and/or heads (null means "all"). */
export function attention(
  s: Sentence,
  layer: number | null,
  head: number | null,
  query: number,
): Float32Array {
  const ls = layer === null ? [...Array(s.layers).keys()] : [layer];
  const hs = head === null ? [...Array(s.heads).keys()] : [head];
  const out = new Float32Array(query + 1);
  for (const l of ls) {
    for (const h of hs) {
      const r = s.row(l, h, query);
      for (let k = 0; k <= query; k++) out[k] = (out[k] ?? 0) + (r[k] ?? 0);
    }
  }
  const n = ls.length * hs.length;
  for (let k = 0; k <= query; k++) out[k] = (out[k] ?? 0) / n;
  return out;
}

/** The k largest weights as [key index, weight], largest first. */
export function topK(row: ArrayLike<number>, k: number): [number, number][] {
  return Array.from({ length: row.length }, (_, i): [number, number] => [i, row[i] ?? 0])
    .sort((a, b) => b[1] - a[1] || a[0] - b[0])
    .slice(0, k);
}

/**
 * What a head mostly does, in plain words, measured over every query token of
 * the sentence (from the third token on, where there is a real choice).
 */
export function describeHead(s: Sentence, layer: number | null, head: number | null): string {
  const T = s.tokens.length;
  let first = 0;
  let previous = 0;
  let self = 0;
  let entropy = 0;
  let n = 0;
  for (let q = 2; q < T; q++) {
    const r = attention(s, layer, head, q);
    first += r[0] ?? 0;
    previous += r[q - 1] ?? 0;
    self += r[q] ?? 0;
    let e = 0;
    for (const w of r) if (w > 0) e -= w * Math.log(w);
    entropy += e / Math.log(q + 1);
    n++;
  }
  if (!n) return '';
  [first, previous, self, entropy] = [first / n, previous / n, self / n, entropy / n];
  const pct = (v: number) => `${Math.round(v * 100)}%`;
  if (previous > 0.45)
    return `Mostly looks at the previous token (${pct(previous)} of its attention on average).`;
  if (first > 0.5)
    return `Mostly rests on the first token (${pct(first)}), a common "attention sink" when nothing else is relevant.`;
  if (self > 0.45) return `Mostly looks at the token itself (${pct(self)}).`;
  if (entropy > 0.8) return 'Spreads its attention broadly across the sentence.';
  return 'Picks out specific earlier tokens that differ from query to query.';
}

/** A token as a reader sees it: GPT-2 marks a leading space with the token itself. */
export const display = (token: string) => (token.trim() === '' ? '␣' : token.trim());
