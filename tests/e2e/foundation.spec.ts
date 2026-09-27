import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const pages = ['/', '/projects/', '/projects/inference-gateway/', '/404'];

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

  await page.getByRole('link', { name: 'Work' }).click();
  await expect(page).toHaveURL(/\/projects\/$/);
  await page.locator('main a[href="/projects/inference-gateway/"]').click();
  await expect(page.locator('html')).toHaveAttribute('data-world-mode', 'band');
  await expect(page.locator('html')).toHaveAttribute('data-world-formation', 'sde');

  const marker = await page.evaluate(
    () => (document.getElementById('world') as HTMLElement & { marker?: number }).marker,
  );
  expect(marker).toBe(42);
  await expect(page.locator('#world')).toHaveAttribute('aria-hidden', 'true');
});

test('theme and pause are remembered across navigation and reloads', async ({ page }) => {
  await page.goto('/');
  const html = page.locator('html');
  await expect(html).toHaveAttribute('data-theme', 'dark');

  await page.getByRole('button', { name: 'Light theme' }).click();
  await page.getByRole('button', { name: 'Pause motion' }).click();
  await expect(html).toHaveAttribute('data-theme', 'light');
  await expect(html).toHaveAttribute('data-world-paused', 'true');

  await page.getByRole('link', { name: 'Work' }).click();
  await expect(html).toHaveAttribute('data-theme', 'light');
  await expect(page.getByRole('button', { name: 'Pause motion' })).toHaveAttribute('aria-pressed', 'true');

  await page.reload();
  await expect(html).toHaveAttribute('data-theme', 'light');
  await expect(html).toHaveAttribute('data-world-paused', 'true');
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
