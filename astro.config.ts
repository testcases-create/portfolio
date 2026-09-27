import { defineConfig, fontProviders } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import type { AstroIntegration } from 'astro';
import { audit, formatAudit, isBlocking } from './scripts/content-audit.ts';
import site from './src/data/site.json' with { type: 'json' };
import { strip } from './src/lib/placeholders.ts';

import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * Demo builds (`npm run build:demo`, DEMO=1) publish the example persona: they
 * allow placeholders (shown as [EDIT] badges), mark every page noindex, send an
 * X-Robots-Tag header for every file (the résumé PDF and images too), and leave
 * out the sitemap and the /dev pages. Launch switches netlify.toml to
 * `npm run build`, which is strict and has none of this.
 */
const DEMO = process.env.DEMO === '1';
const placeholdersAllowed = DEMO || process.env.ALLOW_PLACEHOLDERS === '1';

// Production builds fail while any placeholder tag or empty media frame
// remains, however the build is started. Preview and demo builds allow them.
const contentGate = (): AstroIntegration => ({
  name: 'content-gate',
  hooks: {
    'astro:build:start': ({ logger }) => {
      const result = audit(process.cwd());
      if (!isBlocking(result)) return;
      if (placeholdersAllowed) {
        logger.warn(
          `${result.placeholders.length} placeholder(s) and ${result.emptyFrames.length} empty frame(s) allowed (${DEMO ? 'DEMO=1' : 'ALLOW_PLACEHOLDERS=1'}).`,
        );
        return;
      }
      logger.error(formatAudit(result));
      throw new Error('Placeholders remain. Run `npm run check-content` for the list.');
    },
  },
});

// Demo builds: every file is sent with X-Robots-Tag: noindex (Netlify reads
// _headers from the published folder), on top of the meta tag in each page.
const demoHeaders = (): AstroIntegration => ({
  name: 'demo-headers',
  hooks: {
    'astro:build:done': ({ dir, logger }) => {
      if (!DEMO) return;
      const file = fileURLToPath(new URL('_headers', dir));
      const existing = existsSync(file) ? `${readFileSync(file, 'utf8')}\n` : '';
      writeFileSync(file, `${existing}/*\n  X-Robots-Tag: noindex, nofollow\n`);
      logger.info('Demo build: every page is noindex, and _headers sends X-Robots-Tag: noindex.');
    },
  },
});

// The world test page and the social-card templates exist in dev and preview builds only.
const devPages = (): AstroIntegration => ({
  name: 'dev-pages',
  hooks: {
    'astro:config:setup': ({ command, injectRoute }) => {
      if (command === 'dev' || (process.env.ALLOW_PLACEHOLDERS === '1' && !DEMO)) {
        injectRoute({ pattern: '/dev/world', entrypoint: './src/dev/world.astro' });
        injectRoute({ pattern: '/dev/og/[card]', entrypoint: './src/dev/og.astro' });
      }
    },
  },
});

const archivo = './src/assets/fonts/archivo-latin-normal.woff2';
const serif = './src/assets/fonts/source-serif-4-latin-normal.woff2';
const serifItalic = './src/assets/fonts/source-serif-4-latin-italic.woff2';

export default defineConfig({
  site: strip(site.siteUrl),
  output: 'static',
  trailingSlash: 'ignore',
  integrations: [
    // A sitemap invites indexing, so demo builds have none.
    ...(DEMO ? [] : [sitemap({ filter: (page) => !page.includes('/dev/') })]),
    contentGate(),
    devPages(),
    demoHeaders(),
  ],
  vite: {
    // Pages read this at build time to add noindex in demo builds.
    define: { 'import.meta.env.DEMO': JSON.stringify(DEMO ? '1' : '') },
    // three.js is one ~1 MB (minified) module. scripts/budgets.ts enforces the real,
    // gzipped budgets per page, so Vite's generic warning adds nothing.
    build: { chunkSizeWarningLimit: 1100 },
  },
  fonts: [
    {
      provider: fontProviders.local(),
      name: 'Archivo',
      cssVariable: '--font-archivo',
      fallbacks: ['sans-serif'],
      options: {
        variants: [{ src: [archivo], weight: '400 700', stretch: '100% 125%', style: 'normal' }],
      },
    },
    {
      provider: fontProviders.local(),
      name: 'Source Serif 4',
      cssVariable: '--font-source-serif',
      fallbacks: ['serif'],
      options: {
        variants: [
          { src: [serif], weight: '400 700', style: 'normal' },
          { src: [serifItalic], weight: '400 700', style: 'italic' },
        ],
      },
    },
  ],
});
