// Prints /resume with its print stylesheet to public/resume.pdf.
//
//   npm run build:preview && npx astro preview --port 4321 &
//   npm run resume-pdf
//
// The PDF must stay one page; the script fails if it doesn't.
import { readFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

const BASE = process.env.RESUME_URL ?? 'http://localhost:4321';
const browser = await chromium.launch(
  process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {},
);
const page = await browser.newPage();
await page.addInitScript(() => localStorage.setItem('pref:tier', 'poster'));
await page.goto(`${BASE}/resume/`);
await page.evaluate(() => document.fonts.ready);
await page.pdf({ path: 'public/resume.pdf', format: 'A4', printBackground: true, preferCSSPageSize: true });
await browser.close();

const pages = (readFileSync('public/resume.pdf', 'latin1').match(/\/Type\s*\/Page[^s]/g) ?? []).length;
console.log(`public/resume.pdf: ${pages} page(s)`);
if (pages !== 1) process.exit(1);
