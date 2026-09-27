import type { APIRoute } from 'astro';

// Demo builds have no sitemap, and their pages carry noindex; crawlers may still
// fetch pages, which is how they see the noindex.
export const GET: APIRoute = ({ site }) =>
  new Response(
    import.meta.env.DEMO === '1'
      ? 'User-agent: *\nAllow: /\n'
      : `User-agent: *\nAllow: /\n\nSitemap: ${new URL('sitemap-index.xml', site)}\n`,
  );
