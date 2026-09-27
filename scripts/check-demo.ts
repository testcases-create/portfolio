// Checks a demo build (`npm run build:demo`) before it is published: every
// page is noindex, the _headers file sends X-Robots-Tag: noindex for every
// file, there is no sitemap and no /dev page, and the [EDIT] badges are still
// visible. CI runs it; run it yourself with:
//
//   npm run build:demo && npm run check-demo
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';

const dist = 'dist';
const pages = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? pages(join(dir, e.name)) : e.name.endsWith('.html') ? [join(dir, e.name)] : [],
  );

const problems: string[] = [];
const html = pages(dist);
let badges = 0;
for (const file of html) {
  const source = readFileSync(file, 'utf8');
  if (!/<meta name="robots" content="noindex[^"]*"/.test(source)) {
    problems.push(`${relative(dist, file)} has no noindex meta tag`);
  }
  badges += (source.match(/class="edit-badge"/g) ?? []).length;
}
const headers = existsSync(join(dist, '_headers')) ? readFileSync(join(dist, '_headers'), 'utf8') : '';
if (!/^\/\*\s*\n\s+X-Robots-Tag: noindex/m.test(headers))
  problems.push('_headers does not send X-Robots-Tag: noindex for /*');
if (existsSync(join(dist, 'sitemap-index.xml'))) problems.push('a sitemap was published');
if (/Sitemap:/.test(readFileSync(join(dist, 'robots.txt'), 'utf8')))
  problems.push('robots.txt points to a sitemap');
if (existsSync(join(dist, 'dev'))) problems.push('the /dev test pages were published');
if (badges === 0) problems.push('no [EDIT] badges found: is this a demo build of the example content?');

if (problems.length) {
  console.error(`Demo build check failed:\n${problems.map((p) => `  - ${p}`).join('\n')}`);
  process.exit(1);
}
console.log(
  `Demo build ok: ${html.length} pages noindex, X-Robots-Tag header set, ${badges} [EDIT] badges visible.`,
);
