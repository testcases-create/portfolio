// Phase 4: the architecture explorer ("Explore in 3D"), BRIEF.md 6.5.
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

test.describe('with the live world', () => {
  test.skip(({ isMobile }) => isMobile, 'world tests run on the desktop project');
  // The CPU tier keeps this fast on machines without a GPU; the formation data path is the same.
  test.beforeEach(tier('low'));

  test('loads on demand, morphs the world into the graph, and focuses nodes', async ({ page }) => {
    const chunks: string[] = [];
    page.on('request', (r) => chunks.push(r.url()));
    await page.goto('/projects/inference-gateway/');
    const html = page.locator('html');
    await expect(html).toHaveAttribute('data-world-ready', 'true', { timeout: 30_000 });
    expect(chunks.filter((u) => /\/explorer\./.test(u))).toEqual([]);

    const open = page.getByRole('button', { name: 'Explore in 3D' });
    await open.click();
    const dialog = page.getByRole('dialog', { name: /Architecture: Inference gateway/ });
    await expect(dialog).toBeVisible();
    await expect(html).toHaveAttribute('data-world-explore', 'true');
    await expect(html).toHaveAttribute('data-world-formation', 'graph');
    expect(chunks.some((u) => /\/explorer\./.test(u))).toBe(true);

    await dialog.getByRole('button', { name: /^Batcher/ }).click();
    await expect(dialog.getByRole('button', { name: /^Batcher/ })).toHaveAttribute('aria-pressed', 'true');
    await expect(dialog.locator('[data-explore-status]')).toContainText(
      'Batcher: connects from Inference gateway, to Triton',
    );
    await dialog.getByRole('button', { name: /^Cache miss/ }).click();
    await expect(dialog.locator('[data-explore-status]')).toContainText('Cache miss');

    // Keyboard orbit in the view doesn't move focus out of it.
    await dialog.locator('[data-explore-stage]').focus();
    await page.keyboard.press('ArrowLeft');
    await expect(dialog.locator('[data-explore-stage]')).toBeFocused();

    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(html).not.toHaveAttribute('data-world-explore', /.*/);
    await expect(html).toHaveAttribute('data-world-formation', 'sde');
    await expect(open).toBeFocused();
  });

  test('the open explorer has no WCAG A/AA violations', async ({ page }) => {
    await page.goto('/projects/support-agent/');
    await expect(page.locator('html')).toHaveAttribute('data-world-ready', 'true', { timeout: 30_000 });
    await page.getByRole('button', { name: 'Explore in 3D' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-world-explore', 'true');
    const { violations } = await new AxeBuilder({ page })
      .include('dialog')
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze();
    expect(violations, violations.map((v) => v.id).join(', ')).toEqual([]);
  });
});

test.describe('on the poster tier', () => {
  test.beforeEach(tier('poster'));

  test('is the list of components and flows, and says why there is no 3D view', async ({ page }) => {
    await page.goto('/projects/support-agent/');
    await expect(page.locator('html')).toHaveAttribute('data-world-ready', 'true');
    await page.getByRole('button', { name: 'Explore in 3D' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.locator('[data-explore-help]')).toContainText('The 3D view is off because');
    await expect(dialog.getByRole('button', { name: /^Retriever/ })).toBeVisible();
    await dialog.getByRole('button', { name: /^Retriever/ }).click();
    await expect(dialog.locator('[data-explore-status]')).toContainText(
      'Retriever: connects from Agent orchestrator',
    );
    await dialog.getByRole('button', { name: 'Close' }).click();
    await expect(dialog).toBeHidden();
    await expect(page.locator('html')).toHaveAttribute('data-world-backend', 'none');
  });
});

test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false });

  test('hides the button; the diagram and its flow list are the architecture', async ({ page }) => {
    await page.goto('/projects/inference-gateway/');
    await expect(page.getByRole('button', { name: 'Explore in 3D' })).toBeHidden();
    await expect(page.locator('.diagram svg')).toBeVisible();
  });
});
