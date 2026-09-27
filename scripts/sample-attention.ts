// Writes public/lab/attention.json with SAMPLE data: attention patterns made
// from simple rules (previous-token heads, first-token sinks, broad heads,
// heads that pick out content words), in the same format the real script
// writes. It exists so the demo works before scripts/precompute-attention.py
// has been run against the model. The file's note carries the [EDIT] tag, so a
// production build fails until the real data replaces it.
//
//   npm run sample-attention
import { mkdirSync, writeFileSync } from 'node:fs';
import { SENTENCES } from './attention-sentences.ts';
import { encode, triangle, type AttentionFile } from '../src/lab/watch-attention/logic.ts';

const LAYERS = 6;
const HEADS = 12;

/** Roughly how GPT-2's tokeniser splits text: words and number chunks keep their leading space. */
export function roughTokens(text: string): string[] {
  return text.match(/ ?[A-Za-z]+| ?\d{1,3}| ?[^\sA-Za-z\d]/g) ?? [];
}

function softmax(scores: number[]): number[] {
  const m = Math.max(...scores);
  const e = scores.map((s) => Math.exp(s - m));
  const sum = e.reduce((a, b) => a + b, 0);
  return e.map((v) => v / sum);
}

function row(tokens: string[], layer: number, head: number, q: number): number[] {
  const kind = (head + layer * 5) % 6;
  const depth = layer / (LAYERS - 1);
  return softmax(
    Array.from({ length: q + 1 }, (_, k) => {
      const t = tokens[k] ?? '';
      const content = t.trim().length > 3 ? 1 : 0;
      const sink = k === 0 ? 1.5 + 2.5 * depth : 0;
      if (kind === 0) return (k === q - 1 ? 4 : 0) + sink * 0.3;
      if (kind === 1) return sink + (k === q ? 1 : 0);
      if (kind === 2) return (k === q ? 3 : 0) + sink * 0.4;
      if (kind === 3) return 0.2 * Math.sin(k * 1.7 + head) + sink * 0.2;
      if (kind === 4) return content * 2.2 - (q - k) * 0.15 + sink * 0.5;
      return (/[,.]/.test(t) ? 3 : 0) + sink * 0.6 - (q - k) * 0.05;
    }),
  );
}

const file: AttentionFile & { note: string } = {
  model: 'distilgpt2',
  source: 'sample',
  note: 'Sample attention made from simple rules, not from the model. Run scripts/precompute-attention.py to replace it. [EDIT]',
  layers: LAYERS,
  heads: HEADS,
  sentences: SENTENCES.map((text) => {
    const tokens = roughTokens(text);
    const rows: number[][] = [];
    for (let l = 0; l < LAYERS; l++)
      for (let h = 0; h < HEADS; h++) for (let q = 0; q < tokens.length; q++) rows.push(row(tokens, l, h, q));
    if (rows.flat().length !== triangle(tokens.length) * LAYERS * HEADS) throw new Error('size mismatch');
    return { text, tokens, attention: encode(rows, (b) => Buffer.from(b).toString('base64')) };
  }),
};

mkdirSync('public/lab', { recursive: true });
// One field per line, so the audit's report shows the note and not 45 KB of base64.
const { sentences, ...head } = file;
const lines = Object.entries(head).map(([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v)}`);
const body = sentences.map((x) => `    ${JSON.stringify(x)}`).join(',\n');
writeFileSync('public/lab/attention.json', `{\n${lines.join(',\n')},\n  "sentences": [\n${body}\n  ]\n}\n`);
console.log(`Wrote public/lab/attention.json (sample data, ${file.sentences.length} sentences).`);
