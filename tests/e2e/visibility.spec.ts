// The world must be visible on every tier in both themes. A regression that
// shipped: on the high tier (WebGPU) in the light theme, the particles' bloom
// glow output replaced their colour output whenever the bloom pass wasn't
// drawing, so the world was invisible while Stats said everything was fine.
// These tests look at the pixels: each tier renders the Data formation (no
// signals, so nothing reaches it through the glow path) and the test counts
// pixels that clearly differ from the background.
//
// Coverage: CI checks the medium and low tiers. CI's Chromium starts WebGPU
// but can't present its frames, so the high tier skips there; run this file
// on a machine with a GPU to check it (see docs/walkthrough.md).
import { expect, test, type Page } from '@playwright/test';
import sharp from 'sharp';

test.skip(({ isMobile }) => isMobile, 'world tests run on the desktop project');

const GROUND = { dark: [0x1a, 0x1d, 0x23], light: [0xee, 0xf0, 0xf2] } as const;
/** Share of the world's area that must show particles; the broken tier measured about 0. */
const MIN_VISIBLE = 0.004;

/** Share of pixels in the world's region that differ clearly from the page background. */
async function visibleShare(page: Page, theme: 'dark' | 'light'): Promise<number> {
  const { width = 1440, height = 900 } = page.viewportSize() ?? {};
  // Wide screens compose the world into the band right of the text column (REGION in world.ts).
  const png = await page.screenshot({
    clip: { x: Math.round(width * 0.5), y: 0, width: Math.round(width * 0.46), height },
  });
  const { data, info } = await sharp(png).raw().toBuffer({ resolveWithObject: true });
  const g = GROUND[theme];
  let visible = 0;
  for (let i = 0; i < data.length; i += info.channels) {
    const d =
      Math.abs((data[i] ?? 0) - g[0]) +
      Math.abs((data[i + 1] ?? 0) - g[1]) +
      Math.abs((data[i + 2] ?? 0) - g[2]);
    if (d > 45) visible++;
  }
  return visible / (info.width * info.height);
}

async function open(page: Page, tier: string, theme: 'dark' | 'light') {
  await page.emulateMedia({ colorScheme: theme });
  await page.addInitScript(() => sessionStorage.setItem('intro:seen', '1'));
  // 4,096 particles keep software rendering fast; the render path is the tier's own.
  await page.goto(`/dev/world/?tier=${tier}&particles=4096`);
  await expect(page.locator('html')).toHaveAttribute('data-world-ready', 'true', { timeout: 60_000 });
  // Only the world: hide the page's text so it can't count as particles.
  await page.addStyleTag({
    content:
      'header, main, footer, .skip-link, #world-caption, .world-labels { visibility: hidden !important; }',
  });
}

/** Switches the device's light or dark setting, which the theme follows live. */
const setTheme = (page: Page, theme: 'dark' | 'light') => page.emulateMedia({ colorScheme: theme });

/** Waits for a few frames to be drawn, then measures. */
async function settleAndMeasure(page: Page, theme: 'dark' | 'light') {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        let n = 0;
        const tick = () => (++n >= 6 ? resolve() : requestAnimationFrame(tick));
        requestAnimationFrame(tick);
      }),
  );
  await page.waitForTimeout(1500);
  return visibleShare(page, theme);
}

/** The Stats for nerds snapshot, which the engine publishes while the panel is open. */
const stats = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<Record<string, string>>((resolve) => {
        const panel = document.getElementById('world-stats');
        const done = (detail: Record<string, string>) => {
          if (panel) panel.hidden = true;
          resolve(detail);
        };
        if (panel) panel.hidden = false;
        document.documentElement.addEventListener(
          'world:stats',
          (e) => done((e as CustomEvent<Record<string, string>>).detail),
          { once: true },
        );
        setTimeout(() => done({}), 2000);
      }),
  );

for (const tier of ['high', 'medium', 'low'] as const) {
  test(`the ${tier} tier draws visible particles in the light theme, at load and after switching themes`, async ({
    page,
  }) => {
    test.slow();
    const logs: string[] = [];
    page.on('console', (m) => ['error', 'warning'].includes(m.type()) && logs.push(m.text().slice(0, 300)));
    page.on('pageerror', (e) => logs.push(`page error: ${e.message.slice(0, 300)}`));
    await open(page, tier, 'light');
    const atLoad = await settleAndMeasure(page, 'light');
    // A tier that fails on its first frames steps down; read what actually ran.
    const ran = await page.locator('html').getAttribute('data-world-tier');
    test.skip(ran !== tier, `this browser can't run the ${tier} tier here (it ran as ${ran})`);
    test.info().annotations.push({ type: 'tier', description: `${tier} ran as ${ran}` });
    const lightStats = await stats(page);

    // Switching the device's theme while running takes the other path through the render code.
    await setTheme(page, 'dark');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    const dark = await settleAndMeasure(page, 'dark');
    const darkStats = await stats(page);

    await setTheme(page, 'light');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    const back = await settleAndMeasure(page, 'light');

    // CI's software WebGPU runs compute but loses its device when presenting
    // frames, so nothing is drawn in either theme. That is the environment, not
    // this page: skip, and say so. Any other blank frame still fails.
    const deviceLost = logs.some((l) =>
      /Instance dropped|Instance reference no longer exists|device lost/i.test(l),
    );
    test.skip(
      deviceLost && atLoad === 0 && dark === 0 && back === 0,
      `the ${tier} tier's GPU device was lost here and drew nothing in either theme`,
    );

    // Everything measured goes into each message, so a failure in CI explains itself.
    const pct = (v: number) => `${(v * 100).toFixed(2)}%`;
    const report = [
      `visible: light at load ${pct(atLoad)}, dark ${pct(dark)}, light after switching ${pct(back)}`,
      `stats (light): ${JSON.stringify(lightStats)}`,
      `stats (dark): ${JSON.stringify(darkStats)}`,
      `console: ${logs.join(' | ') || '(empty)'}`,
    ].join('\n');
    expect(atLoad, `light theme at load\n${report}`).toBeGreaterThan(MIN_VISIBLE);
    expect(dark, `dark theme\n${report}`).toBeGreaterThan(MIN_VISIBLE);
    expect(back, `light theme after switching\n${report}`).toBeGreaterThan(MIN_VISIBLE);
    // The light theme must read at least as well as the dark one.
    expect(back, `light against dark\n${report}`).toBeGreaterThan(dark * 0.9);
  });
}
