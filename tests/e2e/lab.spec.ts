// Phase 4: the Lab. Each demo loads only when opened, works with a keyboard,
// and works without a 3D view (the poster tier), which is what most of these
// tests use so they stay fast. The 3D views and GPU training run in separate,
// desktop-only tests.
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const tier =
  (t: string) =>
  async ({ page }: { page: Page }) => {
    await page.addInitScript((value) => {
      localStorage.setItem('pref:tier', value);
      sessionStorage.setItem('intro:seen', '1');
    }, t);
  };

async function open(page: Page, demo: string) {
  await page.locator(`[data-demo-open="${demo}"]`).click();
  const el = page.locator(`[data-demo="${demo}"]`);
  await expect(el).toBeVisible();
  await expect(el).toHaveAttribute('data-view3d', /on|off/);
  return el;
}

test.describe('on the poster tier', () => {
  test.beforeEach(tier('poster'));

  test('loads each demo only when it is opened', async ({ page }) => {
    const chunks: string[] = [];
    page.on('request', (r) => chunks.push(r.url()));
    await page.goto('/lab/');
    await page.waitForLoadState('networkidle');
    const demoChunk =
      /\/(train-network|watch-attention|scale-system|network-scene|attention-scene|system-scene)\./;
    expect(chunks.filter((u) => demoChunk.test(u))).toEqual([]);
    expect(chunks.filter((u) => u.includes('attention.json'))).toEqual([]);

    await open(page, 'scale-system');
    expect(chunks.some((u) => /\/scale-system\./.test(u))).toBe(true);
    // No 3D view on the poster tier, so three.js and the scene never download.
    expect(chunks.filter((u) => /system-scene|three/.test(u))).toEqual([]);
  });

  test('scale a system: overload one replica, then add replicas', async ({ page }) => {
    await page.goto('/lab/');
    const demo = await open(page, 'scale-system');
    await expect(demo).toHaveAttribute('data-view3d', 'off');
    const rps = demo.locator('#scale-rps');
    await rps.fill('800');
    await demo.getByRole('button', { name: 'Remove a replica' }).click();
    await expect(demo.locator('output[name="replicasOut"]')).toHaveText('1');
    await expect
      .poll(async () => parseFloat((await demo.locator('[data-metric="errors"]').textContent()) ?? '0'), {
        timeout: 10_000,
      })
      .toBeGreaterThan(20);

    for (let i = 0; i < 5; i++) await demo.getByRole('button', { name: 'Add a replica' }).click();
    await expect(demo.locator('output[name="replicasOut"]')).toHaveText('6');
    // The error rate covers the last five seconds, so it falls as the overload leaves the window.
    await expect
      .poll(async () => parseFloat((await demo.locator('[data-metric="errors"]').textContent()) ?? '100'), {
        timeout: 15_000,
      })
      .toBeLessThan(1);
    await expect(demo.locator('[data-replicas] li')).toHaveCount(6);
    await expect(demo.locator('[data-summary]')).toContainText('6 replicas');
  });

  test('train a network: add points with the keyboard and watch it learn', async ({ page }) => {
    await page.goto('/lab/');
    const demo = await open(page, 'train-network');
    await expect(demo.locator('[data-where]')).toContainText('CPU');
    await demo.getByLabel('Example data').selectOption('clusters');
    const steps = async () =>
      Number(((await demo.locator('[data-metric="steps"]').textContent()) ?? '0').replace(/,/g, ''));
    await expect.poll(steps).toBeGreaterThan(100);
    await expect(demo.locator('[data-metric="accuracy"]')).toHaveText('100%', { timeout: 10_000 });

    const field = demo.locator('[data-field]');
    await field.focus();
    await demo.getByLabel(/Class B/).check();
    await field.focus();
    for (let i = 0; i < 4; i++) await page.keyboard.press('ArrowUp');
    await page.keyboard.press('Enter');
    await expect(demo.locator('[data-summary]')).toContainText('81 points', { timeout: 5000 });

    await demo.getByRole('button', { name: 'Pause training' }).click();
    // The read-out refreshes a few times a second; let it catch up before reading it.
    await page.waitForTimeout(500);
    const paused = await steps();
    await page.waitForTimeout(500);
    expect(await steps()).toBe(paused);
    await demo.getByRole('button', { name: 'Train' }).click();
    await expect.poll(steps).toBeGreaterThan(paused);
  });

  test('watch attention: choose a token and read where it looks', async ({ page }) => {
    await page.goto('/lab/');
    const demo = await open(page, 'watch-attention');
    await expect(demo.locator('[data-source]')).toContainText('Sample data');
    await demo
      .getByLabel('Sentence')
      .selectOption({ label: 'She put the book on the table because it was heavy.' });
    await demo.getByRole('button', { name: /^Token \d+: it$/ }).click();
    await expect(demo.getByRole('button', { name: /^Token \d+: it$/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(demo.locator('[data-heading]')).toContainText('Where “it” looks');
    const items = demo.locator('[data-top] li');
    await expect(items).toHaveCount(5);
    const values = await items.locator('.value').allTextContents();
    const numbers = values.map((v) => parseInt(v, 10));
    expect(numbers).toEqual([...numbers].sort((a, b) => b - a));

    await demo.getByLabel('Layer').selectOption({ label: 'Layer 1' });
    await demo.getByLabel('Head').selectOption({ label: 'Head 1' });
    await expect(demo.locator('[data-heading]')).toContainText('layer 1, head 1');
    await expect(demo.locator('[data-describe]')).not.toBeEmpty();
  });

  test('with every demo open, the page has no WCAG A/AA violations in either theme', async ({ page }) => {
    await page.goto('/lab/');
    for (const d of ['train-network', 'watch-attention', 'scale-system']) await open(page, d);
    for (const theme of ['dark', 'light']) {
      await page.evaluate((t) => (document.documentElement.dataset.theme = t), theme);
      const { violations } = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
        .analyze();
      expect(violations, `${theme}: ${violations.map((v) => v.id).join(', ')}`).toEqual([]);
    }
  });
});

test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false });

  test('says each demo needs JavaScript, and hides the buttons', async ({ page }) => {
    await page.goto('/lab/');
    await expect(page.locator('[data-demo-open]').first()).toBeHidden();
    await expect(page.getByText('This demo needs JavaScript.').first()).toBeVisible();
  });
});

test.describe('with 3D', () => {
  test.skip(({ isMobile }) => isMobile, '3D Lab views run on the desktop project');
  test.beforeEach(tier('medium'));

  test('each demo draws its 3D view when the tier allows one', async ({ page }) => {
    await page.goto('/lab/');
    for (const d of ['train-network', 'watch-attention', 'scale-system']) {
      const demo = await open(page, d);
      await expect(demo).toHaveAttribute('data-view3d', 'on');
      await expect(demo.locator('canvas.lab-canvas')).toHaveCount(1);
    }
  });

  test('the WebGPU training kernels match the CPU specification', async ({ page }) => {
    await page.goto('/lab/?lab-debug');
    const hasGpu = await page.evaluate(async () => {
      const gpu = (navigator as Navigator & { gpu?: { requestAdapter(): Promise<unknown> } }).gpu;
      return !!(await gpu?.requestAdapter());
    });
    test.skip(!hasGpu, 'no WebGPU adapter in this browser');
    await open(page, 'train-network');
    await page.waitForFunction(() => '__labTrainParity' in window);
    const result = await page.evaluate(() =>
      (
        window as unknown as {
          __labTrainParity(n: number): Promise<{ backend: string; maxDiff: number; moved: number }>;
        }
      ).__labTrainParity(40),
    );
    expect(result.backend).toBe('webgpu');
    // The weights move a long way in 40 steps; the two implementations agree to float precision.
    expect(result.moved).toBeGreaterThan(0.2);
    expect(result.maxDiff).toBeLessThan(1e-4);
  });
});
