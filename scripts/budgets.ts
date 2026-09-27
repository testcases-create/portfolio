// Measures what each built page loads before idle and checks it against the
// budgets in BRIEF.md section 8 and PLAN.md 7.8. Run after `astro build`:
//
//   npm run budgets
//
// Initial JS = external module scripts, their static imports (followed
// recursively), and inline scripts, gzipped at level 9. Dynamic import()
// chunks are excluded: those are the lazy engine, Lab and explorer budgets.
// KB means 1,000 bytes throughout, as in PLAN.md.
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { gzipSync } from 'node:zlib';

export const BUDGETS = { initialJs: 50_000, preloadedFonts: 60_000 };

const gz = (s: string | Buffer) => gzipSync(s, { level: 9 }).length;

/** Static import specifiers (not dynamic import()) in a built ES module. */
export function staticImports(code: string): string[] {
  const out: string[] = [];
  const re = /(?:^|[;}\s])(?:import|export)\s*(?:[\w*{}\s,$]+\s*from\s*)?["']([^"']+)["']/g;
  for (const m of code.matchAll(re)) if (m[1]) out.push(m[1]);
  return out;
}

export function measurePage(dist: string, htmlFile: string) {
  const html = readFileSync(htmlFile, 'utf8');
  const seen = new Set<string>();
  let bytes = 0;

  const visit = (file: string) => {
    if (seen.has(file)) return;
    seen.add(file);
    const code = readFileSync(file, 'utf8');
    bytes += gz(code);
    for (const spec of staticImports(code)) {
      if (spec.startsWith('.')) visit(resolve(dirname(file), spec));
      else if (spec.startsWith('/')) visit(join(dist, spec));
    }
  };

  for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)) {
    const [, attrs = '', body = ''] = m;
    if (/type="application\/ld\+json"/.test(attrs)) continue;
    const src = /\bsrc="([^"]+)"/.exec(attrs)?.[1];
    if (src) visit(join(dist, src));
    else if (body.trim()) bytes += gz(body);
  }
  for (const [, href = ''] of html.matchAll(/<link rel="modulepreload" href="([^"]+)"/g)) {
    visit(join(dist, href));
  }

  let fonts = 0;
  for (const [, href = ''] of html.matchAll(/<link rel="preload" href="([^"]+)" as="font"/g)) {
    fonts += readFileSync(join(dist, href)).length;
  }
  return { js: bytes, fonts };
}

const pages = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? pages(join(dir, e.name)) : e.name.endsWith('.html') ? [join(dir, e.name)] : [],
  );

if (import.meta.url === `file://${process.argv[1]}`) {
  const dist = resolve('dist');
  const kb = (n: number) => `${(n / 1000).toFixed(1)} KB`;
  let failed = false;
  for (const file of pages(dist)) {
    const { js, fonts } = measurePage(dist, file);
    const over = js > BUDGETS.initialJs || fonts > BUDGETS.preloadedFonts;
    failed ||= over;
    console.log(
      `${over ? 'FAIL' : 'ok  '}  /${relative(dist, file)}  initial JS ${kb(js)} / ${kb(BUDGETS.initialJs)}` +
        `  preloaded fonts ${kb(fonts)} / ${kb(BUDGETS.preloadedFonts)}`,
    );
  }
  if (failed) process.exit(1);
}
