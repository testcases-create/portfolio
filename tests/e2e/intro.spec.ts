// The hero intro grows the Data formation out of a small seed in the world's
// own area. It used to scatter particles over the whole screen, through the
// hero text, where they read as dust or static. These tests hold the intro at
// points along its timeline, let the particles settle, and look at the pixels:
// nothing may be drawn over the text column, and the start must be faint.
//
// CI renders in software, so a frame can take longer than the whole intro.
// Holding the intro at a fixed point (by moving its start time along with the
// clock) makes each measurement independent of how fast frames arrive.
import { expect, test, type Page } from '@playwright/test';
import sharp from 'sharp';

test.skip(({ isMobile }) => isMobile, 'the intro band layout is checked on desktop');

const GROUND = { dark: [0x1a, 0x1d, 0x23], light: [0xee, 0xf0, 0xf2] } as const;

/** Share of the viewport showing particles, and how many particle pixels lie left of `textRight`. */
async function particlePixels(page: Page, theme: 'dark' | 'light', textRight: number) {
  const { data, info } = await sharp(await page.screenshot())
    .raw()
    .toBuffer({ resolveWithObject: true });
  const g = GROUND[theme];
  let total = 0;
  let overText = 0;
  for (let y = 0; y < info.height; y++)
    for (let x = 0; x < info.width; x++) {
      const i = (y * info.width + x) * info.channels;
      const d =
        Math.abs((data[i] ?? 0) - g[0]) +
        Math.abs((data[i + 1] ?? 0) - g[1]) +
        Math.abs((data[i + 2] ?? 0) - g[2]);
      if (d > 45) {
        total++;
        if (x < textRight) overText++;
      }
    }
  return { total: total / (info.width * info.height), overText };
}

/** Holds the intro at `ms` into its timeline, then waits for the particles to settle there. */
async function holdAt(page: Page, ms: number) {
  await page.evaluate((m) => {
    const w = window as unknown as { __hold: number; __holdTimer?: number };
    w.__hold = m;
    w.__holdTimer ??= window.setInterval(() => {
      document.documentElement.dataset.introStart = String(performance.now() - w.__hold);
    }, 16);
  }, ms);
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        let n = 0;
        const tick = () => (++n >= 8 ? resolve() : requestAnimationFrame(tick));
        requestAnimationFrame(tick);
      }),
  );
  await page.waitForTimeout(1200);
}

// A 13-inch MacBook Air's default size, and 1280 px, where the text column
// reaches furthest into the world's band.
for (const [theme, width, height] of [
  ['light', 1470, 956],
  ['dark', 1280, 800],
] as const) {
  test(`the intro stays in the world's area and starts faint (${theme} theme, ${width} px)`, async ({
    page,
  }) => {
    test.slow();
    await page.setViewportSize({ width, height });
    await page.emulateMedia({ colorScheme: theme });
    // The low tier renders fastest in software; the intro is the same on every tier.
    await page.goto('/?tier=low');
    await expect(page.locator('html')).toHaveAttribute('data-intro-start', /\d/);
    await expect(page.locator('html')).toHaveAttribute('data-world-ready', 'true', { timeout: 60_000 });
    // Where the hero's words end (their ink, not their block boxes).
    const textRight = await page.evaluate(() => {
      const range = document.createRange();
      range.selectNodeContents(document.querySelector('.hero') as Element);
      return range.getBoundingClientRect().right;
    });
    // Only the world: hide the page's text so it can't count as particles.
    await page.addStyleTag({
      content:
        'header, main, footer, .skip-link, #world-caption, .world-labels { visibility: hidden !important; }',
    });

    const seen: Record<number, number> = {};
    for (const ms of [0, 300, 700, 1100, 1600, 2200]) {
      await holdAt(page, ms);
      const { total, overText } = await particlePixels(page, theme, textRight);
      seen[ms] = total;
      expect(overText, `${ms} ms into the intro: pixels over the text column`).toBe(0);
    }
    const report = JSON.stringify(seen);
    // The start is faint (the old intro covered the screen from its first frame)...
    expect(seen[0], `share of the screen drawn at each point: ${report}`).toBeLessThan(0.001);
    // ...and the formation grows to its full size by the end.
    expect(seen[2200], report).toBeGreaterThan((seen[300] ?? 0) * 2);
    expect(seen[2200], report).toBeGreaterThan(0.004);
  });
}
