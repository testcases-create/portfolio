// Splits a project's rendered Markdown into its sections, keyed by heading id,
// so the deep-dive template can place components between them.
export function splitSections(html: string): Map<string, string> {
  const out = new Map<string, string>();
  const parts = html.split(/<h2 id="([^"]+)">[\s\S]*?<\/h2>/);
  // parts: [before, id1, body1, id2, body2, ...]
  for (let i = 1; i < parts.length; i += 2) out.set(parts[i] ?? '', (parts[i + 1] ?? '').trim());
  return out;
}
