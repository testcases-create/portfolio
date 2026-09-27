// Renders the social cards (src/dev/og.astro) to public/og/*.png.
//
//   npm run build:preview && npx astro preview --port 4321 &
//   npm run og-images
//
// Re-run whenever a title or the owner details change.
import { mkdirSync, readdirSync, statSync } from 'node:fs';
import { chromium } from '@playwright/test';
import sharp from 'sharp';

const BASE = process.env.OG_URL ?? 'http://localhost:4321';
const cards = ['home', 'default', ...readdirSync('src/content/projects')];

mkdirSync('public/og', { recursive: true });
const browser = await chromium.launch(
  process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {},
);
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
for (const card of cards) {
  await page.goto(`${BASE}/dev/og/${card}/`);
  await page.evaluate(() => document.fonts.ready);
  const png = await page.screenshot({ type: 'png' });
  const out = `public/og/${card}.png`;
  await sharp(png).png({ palette: true, quality: 90, compressionLevel: 9 }).toFile(out);
  console.log(`${out}  ${(statSync(out).size / 1000).toFixed(1)} KB`);
}
await browser.close();
