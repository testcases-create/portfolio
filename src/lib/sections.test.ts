import { describe, expect, it } from 'vitest';
import { splitSections } from './sections';

describe('splitSections', () => {
  it('keys each section body by its heading id', () => {
    const html =
      '<h2 id="context">Context</h2>\n<p>One</p><p>Two</p>\n<h2 id="results">Results</h2><table></table>';
    const s = splitSections(html);
    expect([...s.keys()]).toEqual(['context', 'results']);
    expect(s.get('context')).toBe('<p>One</p><p>Two</p>');
    expect(s.get('results')).toBe('<table></table>');
  });

  it('handles headings with inline markup', () => {
    expect(splitSections('<h2 id="next">What I<em>’d</em> do</h2><p>x</p>').get('next')).toBe('<p>x</p>');
  });
});
