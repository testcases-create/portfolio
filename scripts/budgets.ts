// Measures what each built page loads and checks it against the budgets in
// BRIEF.md section 8 and PLAN.md 7.8. Run after `astro build`:
//
//   npm run budgets
//
// - Initial JS: external module scripts, their static imports (followed
//   recursively) and inline scripts, plus the hero intro chunk on pages that
//   play it (it is a dynamic import, but it runs straight away).
// - Graphics engine: the world-entry chunk and its static imports, minus what
//   the page already loaded. It loads after first paint.
// All gzipped at level 9. KB means 1,000 bytes throughout, as in PLAN.md.
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { gzipSync } from 'node:zlib';

// engineJs: 320 KB since Phase 3 (PLAN.md section 14): the engine loads after first paint.
export const BUDGETS = { initialJs: 50_000, engineJs: 320_000, preloadedFonts: 60_000 };

/**
 * Features that load only when opened (BRIEF.md 8, PLAN.md 7.8): the chunks
 * each one brings, measured after the page and the engine (three.js is
 * already there, so it doesn't count again). The first chunk is the entry;
 * the others are loaded from it.
 */
export const LAZY: Record<
  string,
  { chunks: string[]; budget: number; data?: { file: string; budget: number } }
> = {
  explorer: { chunks: ['explorer'], budget: 25_000 },
  'train-network': { chunks: ['train-network', 'network-scene', 'train-gpu'], budget: 35_000 },
  'watch-attention': {
    chunks: ['watch-attention', 'attention-scene'],
    budget: 25_000,
    data: { file: 'lab/attention.json', budget: 120_000 },
  },
  'scale-system': { chunks: ['scale-system', 'system-scene'], budget: 25_000 },
};

const gz = (s: string | Buffer) => gzipSync(s, { level: 9 }).length;

/** Static import specifiers (not dynamic import()) in a built ES module. */
export function staticImports(code: string): string[] {
  const out: string[] = [];
  const re = /(?:^|[;}\s])(?:import|export)\s*(?:[\w*{}\s,$]+\s*from\s*)?["']([^"']+)["']/g;
  for (const m of code.matchAll(re)) if (m[1]) out.push(m[1]);
  return out;
}

/** Dynamic import() specifiers with a literal path. */
export function dynamicImports(code: string): string[] {
  return [...code.matchAll(/import\(\s*[`'"]([^`'"]+)[`'"]\s*\)/g)].flatMap((m) => (m[1] ? [m[1]] : []));
}

export function measurePage(dist: string, htmlFile: string) {
  const html = readFileSync(htmlFile, 'utf8');
  const seen = new Set<string>();
  const lazy = new Map<string, string>(); // chunk name → absolute path

  /** Adds a module graph to `into` (by default, what the page has loaded); returns its gzipped size. */
  const visit = (file: string, into = seen): number => {
    if (into.has(file)) return 0;
    into.add(file);
    const code = readFileSync(file, 'utf8');
    let bytes = gz(code);
    for (const spec of dynamicImports(code)) {
      const name = /([\w-]+)\.[\w-]+\.js$/.exec(spec)?.[1];
      if (name) lazy.set(name, resolve(dirname(file), spec));
    }
    for (const spec of staticImports(code)) {
      if (spec.startsWith('.')) bytes += visit(resolve(dirname(file), spec), into);
      else if (spec.startsWith('/')) bytes += visit(join(dist, spec), into);
    }
    return bytes;
  };

  let initial = 0;
  for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)) {
    const [, attrs = '', body = ''] = m;
    if (/type="application\/ld\+json"/.test(attrs)) continue;
    const src = /\bsrc="([^"]+)"/.exec(attrs)?.[1];
    if (src) initial += visit(join(dist, src));
    else if (body.trim()) {
      initial += gz(body);
      for (const spec of dynamicImports(body)) {
        const name = /([\w-]+)\.[\w-]+\.js$/.exec(spec)?.[1];
        if (name)
          lazy.set(name, join(dist, spec.startsWith('/') ? spec : `_astro/${spec.replace(/^\.\//, '')}`));
      }
    }
  }
  for (const [, href = ''] of html.matchAll(/<link rel="modulepreload" href="([^"]+)"/g)) {
    initial += visit(join(dist, href));
  }
  const intro = lazy.get('intro');
  if (intro && html.includes('data-world-intro')) initial += visit(intro);

  const entry = lazy.get('world-entry');
  const engine = entry ? visit(entry) : 0;

  let fonts = 0;
  for (const [, href = ''] of html.matchAll(/<link rel="preload" href="([^"]+)" as="font"/g)) {
    fonts += readFileSync(join(dist, href)).length;
  }
  const lazyBytes: Record<string, number> = {};
  for (const [name, feature] of Object.entries(LAZY)) {
    const entryFile = lazy.get(feature.chunks[0] ?? '');
    if (!entryFile) continue;
    const loaded = new Set(seen);
    let bytes = 0;
    for (const chunk of feature.chunks) {
      const file = lazy.get(chunk);
      if (file) bytes += visit(file, loaded);
    }
    lazyBytes[name] = bytes;
  }
  return { js: initial, engine, fonts, lazy: lazyBytes };
}

const pages = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? pages(join(dir, e.name)) : e.name.endsWith('.html') ? [join(dir, e.name)] : [],
  );

if (import.meta.url === `file://${process.argv[1]}`) {
  const dist = resolve('dist');
  const kb = (n: number) => `${(n / 1000).toFixed(1)} KB`;
  let failed = false;
  const features = new Map<string, number>();
  for (const file of pages(dist)) {
    const { js, engine, fonts, lazy } = measurePage(dist, file);
    const over = js > BUDGETS.initialJs || engine > BUDGETS.engineJs || fonts > BUDGETS.preloadedFonts;
    failed ||= over;
    console.log(
      `${over ? 'FAIL' : 'ok  '}  /${relative(dist, file)}  initial JS ${kb(js)} / ${kb(BUDGETS.initialJs)}` +
        `  engine ${kb(engine)} / ${kb(BUDGETS.engineJs)}` +
        `  preloaded fonts ${kb(fonts)} / ${kb(BUDGETS.preloadedFonts)}`,
    );
    for (const [name, bytes] of Object.entries(lazy))
      features.set(name, Math.max(features.get(name) ?? 0, bytes));
  }
  console.log('\nLoaded only when opened (largest on any page):');
  for (const [name, feature] of Object.entries(LAZY)) {
    const bytes = features.get(name);
    const missing = bytes === undefined;
    const over = missing || bytes > feature.budget;
    failed ||= over;
    console.log(
      `${over ? 'FAIL' : 'ok  '}  ${name}  ${missing ? 'not found in any page' : kb(bytes)} / ${kb(feature.budget)}`,
    );
    if (feature.data) {
      const size = gz(readFileSync(join(dist, feature.data.file)));
      const dataOver = size > feature.data.budget;
      failed ||= dataOver;
      console.log(
        `${dataOver ? 'FAIL' : 'ok  '}  ${name} data (${feature.data.file})  ${kb(size)} / ${kb(feature.data.budget)}`,
      );
    }
  }
  if (failed) process.exit(1);
}
