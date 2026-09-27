import { defineConfig, fontProviders } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import type { AstroIntegration } from 'astro';
import { audit, formatAudit, isBlocking } from './scripts/content-audit.ts';
import site from './src/data/site.json' with { type: 'json' };
import { strip } from './src/lib/placeholders.ts';

// Production builds fail while any placeholder tag or empty media frame
// remains, however the build is started. Preview deploys set ALLOW_PLACEHOLDERS=1.
const contentGate = (): AstroIntegration => ({
  name: 'content-gate',
  hooks: {
    'astro:build:start': ({ logger }) => {
      const result = audit(process.cwd());
      if (!isBlocking(result)) return;
      if (process.env.ALLOW_PLACEHOLDERS === '1') {
        logger.warn(
          `${result.placeholders.length} placeholder(s) and ${result.emptyFrames.length} empty frame(s) allowed (ALLOW_PLACEHOLDERS=1).`,
        );
        return;
      }
      logger.error(formatAudit(result));
      throw new Error('Placeholders remain. Run `npm run check-content` for the list.');
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
  integrations: [sitemap(), contentGate()],
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
