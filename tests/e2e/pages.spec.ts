// Phase 3 pages: behaviour that matters to a reader, with and without JavaScript.
import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('pref:tier', 'poster');
    sessionStorage.setItem('intro:seen', '1');
  });
});

test('Home leads with the recruiter essentials above the fold', async ({ page }) => {
  await page.goto('/');
  const fold = page.viewportSize()?.height ?? 800;
  for (const locator of [
    page.locator('#hero-name'),
    page.locator('.hero .role'),
    page.locator('.hero .current'),
    page.getByRole('link', { name: 'Résumé (PDF)' }).first(),
  ]) {
    const box = await locator.boundingBox();
    expect(box?.y ?? Infinity).toBeLessThan(fold);
  }
  await expect(page.locator('script[type="application/ld+json"]')).toHaveCount(1);
  const person = JSON.parse((await page.locator('script[type="application/ld+json"]').textContent()) ?? '{}');
  expect(person['@type']).toBe('Person');
  expect(JSON.stringify(person)).not.toContain('[EDIT]');
});

test('a role lens tailors Home and points its canonical URL at Home', async ({ page }) => {
  await page.goto('/for/llm/');
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', /\/$/);
  expect(await page.locator('link[rel="canonical"]').getAttribute('href')).not.toContain('/for/');
  await expect(page.locator('.hero .role')).toContainText('LLM engineer');
  await expect(page.locator('main .group').first()).toHaveAttribute('data-world-formation', 'llm');
  await expect(page.locator('body')).toHaveAttribute('data-world-formation', 'llm');
});

test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false });

  test('the area filter works through static pages', async ({ page }) => {
    await page.goto('/projects/');
    const all = await page.locator('.project-row').count();
    await page
      .getByRole('navigation', { name: 'Filter projects by area' })
      .getByRole('link', { name: 'LLM' })
      .click();
    await expect(page).toHaveURL(/\/projects\/area\/llm\/$/);
    const llm = page.locator('.project-row');
    expect(await llm.count()).toBeLessThan(all);
    for (const row of await llm.all()) await expect(row.locator('.area[data-area="llm"]')).toHaveCount(1);
  });

  test('decisions and the full write-up are readable, and the toggle stays hidden', async ({ page }) => {
    await page.goto('/projects/support-agent/');
    await expect(page.locator('.view-toggle')).toBeHidden();
    await expect(page.locator('.deep-dive')).toHaveAttribute('data-view', 'full');
    await expect(page.locator('#evaluation table')).toBeVisible();
    await page.locator('.decision summary').nth(1).click();
    await expect(page.locator('.decision').nth(1)).toHaveAttribute('open', '');
  });

  test('presentation mode stacks every slide', async ({ page }) => {
    await page.goto('/projects/support-agent/present/');
    const slides = page.locator('.slide');
    expect(await slides.count()).toBeGreaterThan(5);
    await expect(slides.nth(3)).toBeVisible();
  });
});

test('Skim hides the depth, and the choice is remembered across projects', async ({ page }) => {
  await page.goto('/projects/support-agent/');
  // The evaluation table is not a section's first element, so Skim hides it.
  const second = page.locator('#evaluation .section-body > table');
  await expect(second).toBeVisible();
  await page.getByRole('button', { name: 'Skim' }).click();
  await expect(page.getByRole('button', { name: 'Skim' })).toHaveAttribute('aria-pressed', 'true');
  await expect(second).toBeHidden();
  await expect(page.locator('#code-highlight')).toBeHidden();
  // Metrics stay visible in skim, with their measurement notes.
  await expect(page.locator('.tldr .metric-method').first()).toBeVisible();

  await page.goto('/projects/text-to-sql/');
  await expect(page.locator('.deep-dive')).toHaveAttribute('data-view', 'skim');
  await page.getByRole('button', { name: 'Full' }).click();
  await expect(page.locator('.deep-dive')).toHaveAttribute('data-view', 'full');
});

test('a decision opens from the keyboard', async ({ page }) => {
  await page.goto('/projects/order-fulfilment/');
  const summary = page.locator('.decision summary').nth(1);
  await summary.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.decision').nth(1)).toHaveAttribute('open', '');
});

test('every deep dive has the brief sections in order', async ({ page }) => {
  await page.goto('/projects/defect-detection/');
  const ids = await page.locator('.doc-section').evaluateAll((els) => els.map((e) => e.id));
  expect(ids).toEqual([
    'context-and-constraints',
    'architecture',
    'decisions',
    'evaluation',
    'deployment-and-operations',
    'results',
    'code-highlight',
    'what-id-do-next',
  ]);
  await expect(page.locator('.diagram svg[role="img"]')).toHaveCount(1);
  await expect(page.locator('.diagram figcaption li')).toHaveCount(2);
});

test('presentation mode moves with the keyboard and exits with Escape', async ({ page }) => {
  await page.goto('/projects/support-agent/present/');
  const counter = page.locator('[data-counter]');
  await expect(counter).toHaveText(/^1 \/ \d+$/);
  await page.keyboard.press('ArrowRight');
  await expect(counter).toHaveText(/^2 \//);
  await expect(page.locator('.slide[data-active]')).toHaveCount(1);
  await page.keyboard.press('End');
  const total = (await counter.textContent())?.split(' / ')[1];
  await expect(counter).toHaveText(`${total} / ${total}`);
  await page.keyboard.press('Escape');
  await expect(page).toHaveURL(/\/projects\/support-agent\/$/);
  await expect(page.locator('html')).toHaveAttribute('data-world-mode', 'band');
});

test('the résumé prints without site chrome', async ({ page }) => {
  await page.goto('/resume/');
  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('.site-header')).toBeHidden();
  await expect(page.locator('.site-footer')).toBeHidden();
  await expect(page.locator('.resume h1')).toBeVisible();
  const pdf = await page.request.get('/resume.pdf');
  expect(pdf.headers()['content-type']).toContain('pdf');
});

test('every page has a description, a canonical URL and an Open Graph image that exists', async ({
  page,
}) => {
  for (const path of ['/', '/projects/', '/projects/this-site/', '/experience/', '/contact/']) {
    await page.goto(path);
    await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', /.{20,}/);
    await expect(page.locator('link[rel="canonical"]')).toHaveCount(1);
    const og = await page.locator('meta[property="og:image"]').getAttribute('content');
    const res = await page.request.get(new URL(og ?? '').pathname);
    expect(res.ok(), `${path}: ${og}`).toBe(true);
  }
});

test('presentation mode never downloads the graphics engine', async ({ page }) => {
  await page.addInitScript(() => localStorage.removeItem('pref:tier'));
  const engine: string[] = [];
  page.on('request', (r) => /world-entry/.test(r.url()) && engine.push(r.url()));
  await page.goto('/projects/support-agent/present/?tier=medium');
  await page.waitForTimeout(2500);
  expect(engine).toEqual([]);
});

test('on a phone, the poster never sits behind text', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const path of ['/', '/experience/']) {
    await page.goto(path);
    await expect(page.locator('html')).toHaveAttribute('data-world-tier', 'poster');
    const behind = await page.locator('#world').evaluate((el) => getComputedStyle(el).backgroundImage);
    expect(behind, path).toBe('none');
  }
  const window = await page.goto('/').then(() =>
    page
      .locator('.world-window')
      .nth(1)
      .evaluate((el) => getComputedStyle(el, '::before').backgroundImage),
  );
  expect(window).toContain('world-dark-narrow.webp');
  // The hero's window is a gradient, so the hero text stays the LCP element.
  const hero = await page
    .locator('.hero .world-window')
    .evaluate((el) => getComputedStyle(el, '::before').backgroundImage);
  expect(hero).not.toContain('url(');
});
