// Splits text around the [EDIT] tag so components can render it as a badge.
export const EDIT_TAG = '[EDIT]';

export type Segment = { kind: 'text'; value: string } | { kind: 'edit' };

export function segments(text: string): Segment[] {
  const out: Segment[] = [];
  text.split(EDIT_TAG).forEach((part, i) => {
    if (i > 0) out.push({ kind: 'edit' });
    const value = i > 0 ? part.replace(/^ /, '') : part.replace(/ $/, '');
    if (value) out.push({ kind: 'text', value });
  });
  // "a [EDIT] b" keeps one space between the badge and the following word.
  return out.map((s, i) =>
    s.kind === 'text' && out[i - 1]?.kind === 'edit' ? { ...s, value: ` ${s.value}` } : s,
  );
}

/** Text with the tag removed, for attributes (alt, title, meta) and URLs. */
export const strip = (text: string) => text.replaceAll(` ${EDIT_TAG}`, '').replaceAll(EDIT_TAG, '').trim();

export const hasTag = (text: string) => text.includes(EDIT_TAG);
