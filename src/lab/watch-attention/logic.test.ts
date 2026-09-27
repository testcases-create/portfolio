import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SENTENCES } from '../../../scripts/attention-sentences';
import {
  attention,
  decodeSentence,
  describeHead,
  display,
  encode,
  topK,
  triangle,
  type AttentionFile,
} from './logic';

const b64 = (b: Uint8Array) => Buffer.from(b).toString('base64');
const unb64 = (t: string) => new Uint8Array(Buffer.from(t, 'base64'));

/** A one-layer, one-head sentence whose rows come from `pattern`. */
function synthetic(tokens: string[], pattern: (q: number) => number[]) {
  const rows = tokens.map((_, q) => pattern(q));
  return decodeSentence({ text: tokens.join(''), tokens, attention: encode(rows, b64) }, 1, 1, unb64);
}

describe('watch attention', () => {
  it('round-trips weights through one byte each, and each row sums to 1', () => {
    const s = synthetic(['a', ' b', ' c', ' d'], (q) =>
      Array.from({ length: q + 1 }, (_, k) => (k + 1) / triangle(q + 1)),
    );
    for (let q = 0; q < 4; q++) {
      const r = s.row(0, 0, q);
      expect(r).toHaveLength(q + 1);
      expect(r.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 5);
      r.forEach((w, k) => expect(w).toBeCloseTo((k + 1) / triangle(q + 1), 2));
    }
  });

  it('rejects data of the wrong size', () => {
    expect(() =>
      decodeSentence({ text: 'x', tokens: ['a', 'b'], attention: b64(new Uint8Array(2)) }, 1, 1, unb64),
    ).toThrow(/expected 3 bytes/);
  });

  it('averages over layers and heads', () => {
    const tokens = ['a', 'b', 'c'];
    const rows = [
      // layer 0: attend to self; layer 1: attend to the first token.
      ...tokens.map((_, q) => Array.from({ length: q + 1 }, (_, k) => (k === q ? 1 : 0))),
      ...tokens.map((_, q) => Array.from({ length: q + 1 }, (_, k) => (k === 0 ? 1 : 0))),
    ];
    const s = decodeSentence({ text: 'abc', tokens, attention: encode(rows, b64) }, 2, 1, unb64);
    expect(Array.from(attention(s, null, 0, 2))).toEqual([0.5, 0, 0.5]);
    expect(Array.from(attention(s, 1, 0, 2))).toEqual([1, 0, 0]);
  });

  it('ranks the top weights, largest first', () => {
    expect(topK([0.1, 0.5, 0.05, 0.35], 2)).toEqual([
      [1, 0.5],
      [3, 0.35],
    ]);
  });

  it('describes what a head does', () => {
    const tokens = ['a', ' b', ' c', ' d', ' e', ' f'];
    const previous = synthetic(tokens, (q) =>
      Array.from({ length: q + 1 }, (_, k) => (k === Math.max(0, q - 1) ? 1 : 0)),
    );
    const sink = synthetic(tokens, (q) => Array.from({ length: q + 1 }, (_, k) => (k === 0 ? 1 : 0)));
    const broad = synthetic(tokens, (q) => Array.from({ length: q + 1 }, () => 1 / (q + 1)));
    expect(describeHead(previous, 0, 0)).toMatch(/previous token/);
    expect(describeHead(sink, 0, 0)).toMatch(/first token/);
    expect(describeHead(broad, 0, 0)).toMatch(/broadly/);
  });

  it('shows tokens as a reader sees them', () => {
    expect(display(' cache')).toBe('cache');
    expect(display(' ')).toBe('␣');
  });

  it('ships a data file that matches the sentences and decodes cleanly', () => {
    const file = JSON.parse(readFileSync('public/lab/attention.json', 'utf8')) as AttentionFile;
    expect(file.sentences.map((s) => s.text)).toEqual(SENTENCES);
    for (const raw of file.sentences) {
      expect(raw.tokens.join('')).toBe(raw.text);
      const s = decodeSentence(raw, file.layers, file.heads, unb64);
      const last = s.tokens.length - 1;
      expect(attention(s, file.layers - 1, file.heads - 1, last).reduce((a, b) => a + b, 0)).toBeCloseTo(
        1,
        5,
      );
    }
  });
});
