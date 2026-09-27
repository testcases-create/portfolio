// The persistent world (PLAN.md 7, 12): tiers, state mirroring, pause, the
// poster, persistence across navigation, band mode, labels, stats, and the
// GPU kernel checked against the CPU specification.
import { expect, test, type Page } from '@playwright/test';
import { FLOATS_PER_PARTICLE } from '../../src/graphics/formations';
import { stepCpu } from '../../src/graphics/sim.cpu';
import { oneHot, signals, type SimInputs } from '../../src/graphics/sim.shared';

// The world is the same on both projects; run it once, on desktop.
test.skip(({ isMobile }) => isMobile, 'world tests run on the desktop project');

/** Few particles keep software rendering in CI fast; the code paths are the same. */
const world = (path: string, tier = 'medium', extra = '') =>
  `${path}?tier=${tier}&particles=1024${extra ? `&${extra}` : ''}`;

async function ready(page: Page) {
  await page.addInitScript(() => sessionStorage.setItem('intro:seen', '1'));
}
const html = (page: Page) => page.locator('html');

test('the medium tier starts and mirrors its state onto <html>', async ({ page }) => {
  await ready(page);
  await page.goto(world('/'));
  await expect(html(page)).toHaveAttribute('data-world-ready', 'true', { timeout: 30_000 });
  await expect(html(page)).toHaveAttribute('data-world-tier', 'medium');
  await expect(html(page)).toHaveAttribute('data-world-backend', 'webgl2');
  await expect(html(page)).toHaveAttribute('data-world-running', 'true');
  await expect(html(page)).toHaveAttribute('data-world-formation', 'data');
  await expect(page.locator('#world canvas')).toHaveCount(1);
  await expect(page.locator('#world')).toHaveAttribute('aria-hidden', 'true');
  await expect(page.locator('#world-caption')).toContainText('Data');
});

test('the low tier simulates on the CPU', async ({ page }) => {
  await ready(page);
  await page.goto(world('/', 'low'));
  await expect(html(page)).toHaveAttribute('data-world-backend', 'cpu', { timeout: 30_000 });
  await expect(html(page)).toHaveAttribute('data-world-running', 'true');
});

test('Pause stops the frame loop completely, and Play resumes it', async ({ page }) => {
  await ready(page);
  await page.goto(world('/'));
  await expect(html(page)).toHaveAttribute('data-world-running', 'true', { timeout: 30_000 });
  const pause = page.getByRole('button', { name: 'Pause motion' });
  await pause.click();
  await expect(pause).toHaveAttribute('aria-pressed', 'true');
  await expect(html(page)).toHaveAttribute('data-world-running', 'false');
  await pause.click();
  await expect(html(page)).toHaveAttribute('data-world-running', 'true');
});

test('reduced motion gets the poster and never downloads the engine', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const engine: string[] = [];
  page.on('request', (r) => /world-entry|three/.test(r.url()) && engine.push(r.url()));
  await page.goto('/');
  await expect(html(page)).toHaveAttribute('data-world-tier', 'poster');
  await expect(html(page)).not.toHaveClass(/intro/);
  const background = await page.locator('#world').evaluate((el) => getComputedStyle(el).backgroundImage);
  expect(background).toContain('/poster/world-dark.webp');
  const poster = await page.request.get('/poster/world-dark.webp');
  expect(poster.ok()).toBe(true);
  await page.waitForTimeout(2500); // past load + idle, when the engine would have started
  expect(engine).toEqual([]);
});

test('the canvas survives client-side navigation, and project pages get a band', async ({ page }) => {
  await ready(page);
  await page.goto(world('/'));
  await expect(html(page)).toHaveAttribute('data-world-running', 'true', { timeout: 30_000 });
  await page.evaluate(() => Object.assign(document.querySelector('#world canvas') ?? {}, { marker: 42 }));

  await page.getByRole('link', { name: 'Work' }).click();
  await page.locator('main a[href="/projects/inference-gateway/"]').first().click();
  await expect(html(page)).toHaveAttribute('data-world-mode', 'band');
  const marker = await page.evaluate(
    () =>
      (document.querySelector('#world canvas') as (HTMLCanvasElement & { marker?: number }) | null)?.marker,
  );
  expect(marker).toBe(42);

  // The band: #world scrolls with the page and covers the header-and-band block.
  const [slot, band] = await Promise.all([
    page.locator('#world').boundingBox(),
    page.locator('[data-world-band]').boundingBox(),
  ]);
  expect(slot?.height).toBeCloseTo(band?.height ?? 0, 0);
  expect(slot?.y).toBeCloseTo(band?.y ?? 0, 0);
  await expect(page.locator('#world')).toHaveCSS('position', 'absolute');
  // The project's first area is SDE: the world morphs to its formation.
  await expect(html(page)).toHaveAttribute('data-world-formation', 'sde', { timeout: 30_000 });
});

test('the LLM formation shows the sentence as DOM text', async ({ page }) => {
  test.setTimeout(90_000);
  await ready(page);
  await page.goto(world('/dev/world/'));
  await expect(html(page)).toHaveAttribute('data-world-running', 'true', { timeout: 30_000 });
  await page.locator('[data-world-formation="llm"]').scrollIntoViewIfNeeded();
  await expect(html(page)).toHaveAttribute('data-world-formation', 'llm', { timeout: 60_000 });
  await expect(page.locator('.world-labels')).toBeVisible({ timeout: 60_000 });
  await expect(page.locator('.world-labels span').first()).toHaveText('The');
  await expect(page.locator('.world-labels span')).toHaveCount(14);
});

test('Stats for nerds reports the tier, backend and particle count', async ({ page }) => {
  await ready(page);
  await page.goto(world('/'));
  await expect(html(page)).toHaveAttribute('data-world-running', 'true', { timeout: 30_000 });
  const toggle = page.getByRole('button', { name: 'Stats for nerds' });
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  const panel = page.locator('#world-stats');
  await expect(panel).toContainText('medium');
  await expect(panel).toContainText('webgl2');
  await expect(panel).toContainText('1,024');
  await expect(panel.getByLabel('Graphics quality')).toHaveValue('auto');
});

/**
 * Steps the GPU kernel once from the world's current state and compares the
 * result with the CPU specification stepping from the same state.
 */
async function parity(page: Page, backend: 'webgl2' | 'webgpu') {
  // A small viewport keeps each frame cheap on software GPUs (CI has no GPU).
  await page.setViewportSize({ width: 320, height: 240 });
  const logs: string[] = [];
  page.on(
    'console',
    (m) => (m.type() === 'error' || m.type() === 'warning') && logs.push(m.text().slice(0, 300)),
  );
  page.on('pageerror', (e) => logs.push(`page error: ${e.message.slice(0, 300)}`));
  await ready(page);
  // Start paused: the world initialises on the requested backend but draws no
  // frames, so the comparison depends only on the compute kernel.
  await page.addInitScript(() => localStorage.setItem('pref:paused', '1'));
  await page.goto(world('/dev/world/', backend === 'webgpu' ? 'high' : 'medium', 'world-debug'));
  await expect(html(page)).toHaveAttribute('data-world-ready', 'true', { timeout: 30_000 });
  await expect(html(page)).toHaveAttribute('data-world-running', 'false');
  const actual = await html(page).getAttribute('data-world-backend');
  test.skip(actual !== backend, `this browser build fell back from ${backend} to ${actual}`);

  const colour = { neutral: [0.8, 0.8, 0.75], sde: [0.1, 0.4, 1], llm: [1, 0.5, 0], ml: [1, 0.15, 0.4] };
  const cases: SimInputs['weights'][] = [
    oneHot(0),
    oneHot(1),
    oneHot(2),
    oneHot(3),
    oneHot(4),
    [0.1, 0.3, 0.2, 0.25, 0.15],
  ];
  for (const weights of cases) {
    const time = 3.7;
    const input: SimInputs = {
      time,
      dt: 1 / 60,
      assemble: 1,
      weights,
      ...signals(time),
      pointer: [0.5, 0.2, 0],
      pointerStrength: 0.8,
      alpha: 0.5,
      tintBoost: 0.1,
      neutral: colour.neutral as SimInputs['neutral'],
      sde: colour.sde as SimInputs['sde'],
      llm: colour.llm as SimInputs['llm'],
      ml: colour.ml as SimInputs['ml'],
    };
    const r = await page
      .evaluate(async (inp) => {
        const w = (
          window as unknown as {
            __world: { stop(): void; step(i: unknown): Promise<Record<string, unknown>> };
          }
        ).__world;
        w.stop();
        const res = (await w.step(inp)) as {
          before: { pos: Float32Array; vel: Float32Array };
          after: { pos: Float32Array; vel: Float32Array; col: Float32Array };
          form: Float32Array;
          hash: Float32Array;
          n: number;
        };
        const arr = (a: Float32Array) => Array.from(a);
        return {
          n: res.n,
          form: arr(res.form),
          hash: arr(res.hash),
          pos: arr(res.before.pos),
          vel: arr(res.before.vel),
          after: { pos: arr(res.after.pos), vel: arr(res.after.vel), col: arr(res.after.col) },
        };
      }, input)
      .catch((error: Error) => {
        throw new Error(`${error.message}\nPage console:\n${logs.join('\n') || '(empty)'}`);
      });

    expect(r.form.length).toBe(r.n * FLOATS_PER_PARTICLE);
    const S = {
      n: r.n,
      form: new Float32Array(r.form),
      hash: new Float32Array(r.hash),
      pos: new Float32Array(r.pos),
      vel: new Float32Array(r.vel),
      col: new Float32Array(r.n * 4),
    };
    stepCpu(S, input);
    const worst = (a: Float32Array, b: number[]) =>
      a.reduce((m, v, i) => Math.max(m, Math.abs(v - (b[i] ?? NaN)) / Math.max(1, Math.abs(v))), 0);
    const label = `${backend} weights ${weights.join(',')}`;
    expect(worst(S.pos, r.after.pos), `${label}: position`).toBeLessThan(2e-3);
    expect(worst(S.vel, r.after.vel), `${label}: velocity`).toBeLessThan(2e-3);
    expect(worst(S.col, r.after.col), `${label}: colour`).toBeLessThan(2e-3);
  }
}

test('the WebGL2 kernel matches the CPU specification', async ({ page }) => {
  test.setTimeout(90_000);
  await parity(page, 'webgl2');
});

test('the WebGPU kernel matches the CPU specification', async ({ page }) => {
  test.setTimeout(90_000);
  await parity(page, 'webgpu');
});

test('the hero intro plays once per session and never hides the headline', async ({ page }) => {
  await page.goto(world('/'));
  // The headline starts as a ghost, never fully transparent, so it still counts for LCP.
  const opacity = await page.locator('#hero-name').evaluate((el) => Number(getComputedStyle(el).opacity));
  expect(opacity).toBeGreaterThan(0);
  await expect(html(page)).not.toHaveClass(/intro/, { timeout: 5000 });
  expect(await page.evaluate(() => sessionStorage.getItem('intro:seen'))).toBe('1');
  await page.reload();
  await expect(html(page)).not.toHaveClass(/intro/);
});

test('any input skips the intro', async ({ page }) => {
  await page.goto(world('/'));
  await page.keyboard.press('Shift');
  await expect(html(page)).toHaveAttribute('data-intro-skip', '1');
  await expect(page.locator('#hero-name')).toHaveCSS('opacity', '1');
});
