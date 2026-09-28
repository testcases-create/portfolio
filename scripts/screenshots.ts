// Review screenshots (BRIEF.md 11, Phase 5): Home, a project and the Lab, at
// 390 px and 1440 px, in both themes, written to docs/screenshots/ as WebP.
//
//   npm run build:preview && npx astro preview --port 4321 &
//   npm run screenshots
//
// SHOT_TIER picks the world's tier (default medium: WebGL2). Full-page shots
// scroll through the page first, so the choreography reaches every section.
import { mkdirSync } from 'node:fs';
import { chromium, type Page } from '@playwright/test';
import sharp from 'sharp';

const BASE = process.env.SHOT_URL ?? 'http://localhost:4321';
const TIER = process.env.SHOT_TIER ?? 'medium';
const OUT = 'docs/screenshots';
const pages = [
  { name: 'home', path: '/' },
  { name: 'project', path: '/projects/inference-gateway/' },
  { name: 'lab', path: '/lab/', open: ['train-network', 'watch-attention', 'scale-system'] },
];
const widths = [
  { w: 390, h: 844 },
  { w: 1440, h: 900 },
];

async function settle(page: Page) {
  await page.waitForFunction(() => document.documentElement.dataset.worldReady === 'true', null, {
    timeout: 90_000,
  });
  // Scroll through once so lazy sections and the world's choreography run, then return to the top.
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  for (let y = 0; y < height; y += 600) {
    await page.evaluate((top) => window.scrollTo(0, top), y);
    await page.waitForTimeout(150);
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(Number(process.env.SHOT_SETTLE_MS ?? 4000));
}

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch(
  process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {},
);
for (const theme of ['dark', 'light'] as const) {
  for (const { w, h } of widths) {
    for (const p of pages) {
      const context = await browser.newContext({
        viewport: { width: w, height: h },
        colorScheme: theme, // the theme follows the device's setting
      });
      await context.addInitScript((tier) => {
        localStorage.setItem('pref:tier', tier);
        sessionStorage.setItem('intro:seen', '1');
      }, TIER);
      const page = await context.newPage();
      await page.goto(`${BASE}${p.path}`);
      for (const demo of p.open ?? []) {
        await page.locator(`[data-demo-open="${demo}"]`).click();
        await page.locator(`[data-demo="${demo}"][data-view3d]`).waitFor({ timeout: 60_000 });
      }
      await settle(page);
      const png = await page.screenshot({ fullPage: true, type: 'png' });
      const file = `${OUT}/${p.name}-${w}-${theme}.webp`;
      await sharp(png).webp({ quality: 62 }).toFile(file);
      console.log(`wrote ${file}`);
      await context.close();
    }
  }
}
await browser.close();
