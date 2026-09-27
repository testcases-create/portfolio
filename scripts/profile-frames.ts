// Frame-time profile per tier (BRIEF.md 11, Phase 5).
//
//   npm run build:preview && npx astro preview --port 4321 &
//   npm run profile-frames
//
// For each tier, opens /dev/world forced to that tier at 1440 × 900, lets the
// probe and the intro settle, then records requestAnimationFrame intervals
// and long tasks for PROFILE_MS. It reports what actually ran: a tier the
// browser can't run steps down, and the report says so. The low tier's CPU
// simulation step is timed on its own by `npm run bench`.
//
// Run it on the hardware you care about. Headless Chromium without a GPU
// (CI, containers) renders in software, so its numbers are a floor, not a
// measure of a real laptop or phone.
import { chromium } from '@playwright/test';

const BASE = process.env.PROFILE_URL ?? 'http://localhost:4321';
const MS = Number(process.env.PROFILE_MS ?? 8000);
const headed = process.env.PROFILE_HEADED === '1';

const pct = (sorted: number[], p: number) =>
  sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] ?? 0;

const browser = await chromium.launch({
  headless: !headed,
  args: ['--enable-unsafe-webgpu', '--ignore-gpu-blocklist'],
  ...(process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {}),
});
const rows: string[] = [];
for (const tier of ['high', 'medium', 'low'] as const) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.addInitScript(() => sessionStorage.setItem('intro:seen', '1'));
  await page.goto(`${BASE}/dev/world/?tier=${tier}`);
  await page.waitForFunction(() => document.documentElement.dataset.worldReady === 'true', null, {
    timeout: 120_000,
  });
  await page.waitForTimeout(3000);
  const result = await page.evaluate(
    (ms) =>
      new Promise<{ frames: number[]; longTasks: number; ran: string; backend: string }>((resolve) => {
        const frames: number[] = [];
        let longTasks = 0;
        const observer = new PerformanceObserver((list) => (longTasks += list.getEntries().length));
        try {
          observer.observe({ type: 'longtask', buffered: false });
        } catch {
          /* no long-task timing in this browser */
        }
        let last = performance.now();
        const end = last + ms;
        const tick = (now: number) => {
          frames.push(now - last);
          last = now;
          if (now < end) requestAnimationFrame(tick);
          else {
            observer.disconnect();
            const root = document.documentElement.dataset;
            resolve({ frames, longTasks, ran: root.worldTier ?? '?', backend: root.worldBackend ?? '?' });
          }
        };
        requestAnimationFrame(tick);
      }),
    MS,
  );
  const sorted = [...result.frames].sort((a, b) => a - b);
  const fps = (result.frames.length / MS) * 1000;
  rows.push(
    `| ${tier} | ${result.ran} (${result.backend}) | ${fps.toFixed(1)} | ${pct(sorted, 0.5).toFixed(1)} | ${pct(sorted, 0.95).toFixed(1)} | ${result.longTasks} |`,
  );
  await page.close();
}
await browser.close();

console.log(`Frame times over ${MS / 1000} s at 1440 × 900 (${headed ? 'headed' : 'headless'} Chromium)\n`);
console.log('| Asked for | Ran as | FPS | Median frame (ms) | p95 frame (ms) | Long tasks |');
console.log('|---|---|---|---|---|---|');
for (const r of rows) console.log(r);
console.log("\nThe low tier's CPU simulation step on its own: npm run bench");
