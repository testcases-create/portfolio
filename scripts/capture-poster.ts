// Captures the poster tier's stills from the real scene (PLAN.md 7.5).
//
//   npm run build:preview && npx astro preview --port 4321 &
//   npm run capture-poster
//
// Renders the Data formation (the idle state) with the page chrome hidden,
// waits for it to settle, and writes WebP stills for both themes at a wide and
// a narrow size to public/poster/. Budgets: ≤ 60 KB wide, ≤ 25 KB narrow.
// POSTER_TIER picks the tier (default medium). On a machine with a GPU, use
// POSTER_TIER=high PW_HEADED=1 so the stills show bloom and the full count.
import { mkdirSync, statSync } from 'node:fs';
import { chromium } from '@playwright/test';
import sharp from 'sharp';

const BASE = process.env.POSTER_URL ?? 'http://localhost:4321';
const SETTLE_MS = Number(process.env.POSTER_SETTLE_MS ?? 30_000);
const TIER = process.env.POSTER_TIER ?? 'medium';
const shots = [
  { name: 'wide', width: 1600, height: 900, budget: 60_000 },
  { name: 'narrow', width: 780, height: 1100, budget: 25_000 },
];

mkdirSync('public/poster', { recursive: true });
const browser = await chromium.launch({
  headless: process.env.PW_HEADED !== '1',
  ...(TIER === 'high' ? { args: ['--enable-unsafe-webgpu', '--ignore-gpu-blocklist'] } : {}),
  ...(process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {}),
});
let failed = false;
for (const theme of ['dark', 'light'] as const) {
  for (const shot of shots) {
    const context = await browser.newContext({
      viewport: { width: shot.width, height: shot.height },
      colorScheme: theme, // the theme follows the device's setting
    });
    await context.addInitScript(() => sessionStorage.setItem('intro:seen', '1'));
    const page = await context.newPage();
    await page.goto(`${BASE}/dev/world/?tier=${TIER}`);
    await page.waitForFunction(() => document.documentElement.dataset.worldReady === 'true');
    await page.addStyleTag({
      content:
        'header, main, footer, .skip-link, #world-caption, .world-labels { visibility: hidden !important; }',
    });
    await page.waitForTimeout(SETTLE_MS);
    const png = await page.screenshot({ type: 'png' });
    const out = `public/poster/world-${theme}${shot.name === 'narrow' ? '-narrow' : ''}.webp`;
    await sharp(png)
      .webp({ quality: shot.name === 'narrow' ? 58 : 68, effort: 6 })
      .toFile(out);
    const size = statSync(out).size;
    const ok = size <= shot.budget;
    failed ||= !ok;
    console.log(`${ok ? 'ok  ' : 'FAIL'}  ${out}  ${(size / 1000).toFixed(1)} KB / ${shot.budget / 1000} KB`);
    await context.close();
  }
}
await browser.close();
if (failed) process.exit(1);
