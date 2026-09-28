import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const pages = [
  '/',
  '/for/llm/',
  '/projects/',
  '/projects/area/ml/',
  '/projects/inference-gateway/',
  '/projects/predictive-maintenance/',
  '/projects/support-agent/present/',
  '/experience/',
  '/lab/',
  '/about/',
  '/resume/',
  '/contact/',
  '/404',
];

// These tests cover the page, not the graphics (world.spec.ts does): show the
// poster so they stay fast and deterministic.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('pref:tier', 'poster');
    } catch {
      /* storage blocked: the world still starts, which the tests tolerate */
    }
  });
});

for (const path of pages) {
  test(`${path} has no WCAG A/AA violations in either theme`, async ({ page }) => {
    await page.goto(path);
    for (const theme of ['dark', 'light']) {
      await page.evaluate((t) => (document.documentElement.dataset.theme = t), theme);
      const { violations } = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
        .analyze();
      expect(violations, `${theme}: ${violations.map((v) => v.id).join(', ')}`).toEqual([]);
    }
  });
}

test('the world slot persists across client-side navigation', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(
    () => ((document.getElementById('world') as HTMLElement & { marker?: number }).marker = 42),
  );
  await expect(page.locator('html')).toHaveAttribute('data-world-formation', 'data');

  await page.getByRole('link', { name: 'Work', exact: true }).click();
  await expect(page).toHaveURL(/\/projects\/$/);
  await page.locator('main a[href="/projects/inference-gateway/"]').first().click();
  await expect(page.locator('html')).toHaveAttribute('data-world-mode', 'band');
  await expect(page.locator('html')).toHaveAttribute('data-world-formation', 'sde');

  const marker = await page.evaluate(
    () => (document.getElementById('world') as HTMLElement & { marker?: number }).marker,
  );
  expect(marker).toBe(42);
  await expect(page.locator('#world')).toHaveAttribute('aria-hidden', 'true');
});

test('the theme follows the device, from first paint and when it changes', async ({ page }) => {
  const html = page.locator('html');
  await page.emulateMedia({ colorScheme: 'light' });
  // The inline script sets the theme before the page paints: record it at first paint.
  await page.addInitScript(() => {
    new PerformanceObserver((list) => {
      if (list.getEntries().some((e) => e.name === 'first-paint'))
        (window as unknown as { themeAtPaint: string }).themeAtPaint =
          document.documentElement.dataset.theme ?? '';
    }).observe({ type: 'paint', buffered: true });
  });
  await page.goto('/');
  await expect(html).toHaveAttribute('data-theme', 'light');
  expect(await page.evaluate(() => (window as unknown as { themeAtPaint?: string }).themeAtPaint)).toBe(
    'light',
  );
  // There is no theme toggle: the device decides.
  await expect(page.getByRole('button', { name: /theme/i })).toHaveCount(0);

  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(html).toHaveAttribute('data-theme', 'dark');
  await page.getByRole('link', { name: 'Work', exact: true }).click();
  await expect(html).toHaveAttribute('data-theme', 'dark');
  // Chromium can't emulate "no preference"; themeFor() covers it (dark) in the unit tests.
});

test('pause is an icon button with a label and tooltip, remembered across navigation and reloads', async ({
  page,
}) => {
  await page.goto('/');
  const html = page.locator('html');
  const pause = page.getByRole('button', { name: 'Pause motion' });
  await expect(pause).toHaveAttribute('aria-pressed', 'false');

  // The tooltip shows on keyboard focus, and Escape closes it.
  const tip = pause.locator('.tip');
  await pause.focus();
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Tab');
  await expect(tip).toBeVisible();
  await expect(tip.locator('.when-playing')).toBeVisible();
  await expect(tip.locator('.when-paused')).toBeHidden();
  await page.keyboard.press('Escape');
  await expect(tip).toBeHidden();

  await pause.click();
  await expect(html).toHaveAttribute('data-world-paused', 'true');
  await expect(pause).toHaveAttribute('aria-pressed', 'true');
  // Paused: the icon and tooltip offer play instead.
  await expect(pause.locator('svg.when-paused')).toBeVisible();
  await expect(pause.locator('svg.when-playing')).toBeHidden();

  await page.getByRole('link', { name: 'Work', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Pause motion' })).toHaveAttribute('aria-pressed', 'true');

  await page.reload();
  await expect(html).toHaveAttribute('data-world-paused', 'true');
});

// Nothing on the site embeds or loads anything from another origin. The grey
// "blocked content" box seen on a Netlify deploy preview was Netlify's own
// preview toolbar, injected by Netlify and refused by our CSP; production
// never gets it (see README, "Deploying"). This keeps our own pages from
// adding a frame or third-party script that the same CSP would block.
test('pages load nothing from other origins and contain no frames', async ({ page }) => {
  const foreign: string[] = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (!['localhost', '127.0.0.1'].includes(url.hostname) && url.protocol !== 'data:')
      foreign.push(request.url());
  });
  for (const path of ['/', '/projects/', '/lab/', '/contact/']) {
    await page.goto(path);
    await page.waitForLoadState('networkidle');
    await expect(page.locator('iframe, frame, embed, object')).toHaveCount(0);
  }
  expect(foreign).toEqual([]);
});

test('placeholders render as visible badges on preview builds', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('h1 .edit-badge')).toBeVisible();
  await expect(page.locator('h1')).not.toContainText('[EDIT]');
});

test('the hero is the LCP element and renders without graphics', async ({ page }) => {
  await page.goto('/');
  const lcp = await page.evaluate(
    () =>
      new Promise<string>((resolve) => {
        new PerformanceObserver((list) => {
          const last = list.getEntries().at(-1) as PerformanceEntry & { element?: Element };
          resolve(last.element?.closest('h1, p, section')?.tagName ?? 'none');
        }).observe({ type: 'largest-contentful-paint', buffered: true });
      }),
  );
  expect(['H1', 'P', 'SECTION']).toContain(lcp);
  await expect(page.locator('#hero-name')).toBeVisible();
});

test('no horizontal scroll at 360px', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  for (const path of pages) {
    await page.goto(path);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, path).toBeLessThanOrEqual(0);
  }
});
