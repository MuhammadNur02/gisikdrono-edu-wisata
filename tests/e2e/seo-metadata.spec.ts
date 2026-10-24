import { expect, test, type APIRequestContext } from '@playwright/test';
import { z } from 'zod';

import { runSql } from '../../scripts/local-stack';

// Task P5.6.02: the metadata audit as a test. Every address the sitemap lists (the static public pages plus each
// published package, product, article and e-booklet, CLAUDE.md §5.6) is fetched from the production build CI
// serves and must carry its canonical, the title template, an Open Graph image that renders and JSON-LD that
// parses. Plain requests, no browser, so it runs once on the desktop project.

const SITE_NAME = 'Edu Wisata Gisikdrono';
const TITLE_SUFFIX = ` | ${SITE_NAME}`;
const SCHEMA_CONTEXT = 'https://schema.org';
// The kinds whose pages draw their own Open Graph image (opengraph-image.tsx next to the page).
const OWN_OG_IMAGE_PREFIXES = ['/paket-wisata/', '/produk/', '/artikel/'];
// The package pnpm db:seed publishes (scripts/seed-demo-content.sql).
const SEEDED_PACKAGE_PATH = '/paket-wisata/paket-eduwisata-ecowastreme';
// A `[fill me in]` text is a placeholder the site never shows (src/lib/queries/settings.ts, 0008_seed.sql).
const PLACEHOLDER_TEXT = /^\[.*\]$/;
// The entities React escapes in an attribute value.
const HTML_ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&quot;': '"',
  '&#x27;': "'",
  '&lt;': '<',
};

test.skip(({ isMobile }) => isMobile, 'requests only; one project is enough');

function firstMatch(html: string, pattern: RegExp): string | undefined {
  const value = pattern.exec(html)?.[1];
  return value?.replace(/&(amp|quot|#x27|lt);/g, (entity) => HTML_ENTITIES[entity] ?? entity);
}

async function sitemapPaths(request: APIRequestContext): Promise<string[]> {
  const response = await request.get('/sitemap.xml');
  expect(response.status()).toBe(200);
  const xml = await response.text();
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => new URL(match[1] ?? '').pathname);
}

function jsonLdBlocks(html: string): unknown[] {
  return [...html.matchAll(/<script type="application\/ld\+json">([^<]*)<\/script>/g)].map(
    (match): unknown => JSON.parse(match[1] ?? ''),
  );
}

async function expectImage(request: APIRequestContext, url: string) {
  const { pathname, search } = new URL(url);
  const response = await request.get(pathname + search);
  expect(response.status(), url).toBe(200);
  expect(response.headers()['content-type'], url).toMatch(/^image\//);
}

function hasOwnOgImage(path: string): boolean {
  return path === '/' || OWN_OG_IMAGE_PREFIXES.some((prefix) => path.startsWith(prefix));
}

async function auditPage(request: APIRequestContext, path: string, origin: string) {
  const response = await request.get(path);
  expect(response.status(), path).toBe(200);
  const html = await response.text();

  const canonical = new URL(firstMatch(html, /<link rel="canonical" href="([^"]+)"/) ?? '', origin);
  expect(canonical.origin, `${path} canonical origin`).toBe(origin);
  expect(canonical.pathname, `${path} canonical path`).toBe(path);

  const title = firstMatch(html, /<title>([^<]*)<\/title>/);
  if (path === '/') expect(title).toBe(SITE_NAME);
  else expect(title?.endsWith(TITLE_SUFFIX), `${path} title "${title ?? ''}"`).toBe(true);

  const ogImage = firstMatch(html, /<meta property="og:image" content="([^"]+)"/);
  expect(ogImage, `${path} og:image`).toBeDefined();
  if (ogImage && hasOwnOgImage(path)) await expectImage(request, ogImage);

  // The root layout names the kelurahan on every page, so a page without JSON-LD has lost it.
  const blocks = jsonLdBlocks(html);
  expect(blocks.length, `${path} JSON-LD blocks`).toBeGreaterThan(0);
  for (const block of blocks) {
    expect(block, `${path} JSON-LD`).toMatchObject({ '@context': SCHEMA_CONTEXT });
  }
}

async function seededDefaultDescription(): Promise<string> {
  const rows = z
    .array(z.object({ value: z.string() }))
    .parse(
      await runSql(
        "select value #>> '{}' as value from public.site_settings where key = 'seo.default_description'",
      ),
    );
  return rows[0]?.value ?? '';
}

test('the sitemap lists the home page and the seeded package and products', async ({ request }) => {
  const paths = await sitemapPaths(request);
  expect(paths).toContain('/');
  expect(paths).toContain(SEEDED_PACKAGE_PATH);
  expect(paths.some((path) => path.startsWith('/produk/'))).toBe(true);
});

test('every sitemap page has its canonical, the title template, an OG image and valid JSON-LD', async ({
  request,
  baseURL,
}) => {
  test.setTimeout(120_000);
  const origin = new URL(baseURL ?? '').origin;
  for (const path of await sitemapPaths(request)) await auditPage(request, path, origin);
});

// site_settings `seo.default_description`, or no description at all while it is still the placeholder.
test('the home page describes itself with the kelurahan description', async ({ request }) => {
  const seeded = await seededDefaultDescription();
  const isWritten = seeded.trim() !== '' && !PLACEHOLDER_TEXT.test(seeded);
  const html = await (await request.get('/')).text();
  const description = firstMatch(html, /<meta name="description" content="([^"]*)"/);
  if (isWritten) expect(description).toBe(seeded);
  else expect(description).toBeUndefined();
});

// Preview, staging and the CI build are not production (VERCEL_ENV), so nothing may be indexed there.
test('a non-production build keeps every crawler out', async ({ request }) => {
  const robots = await request.get('/robots.txt');
  expect(await robots.text()).toMatch(/Disallow: \/\s*$/m);
  const home = await request.get('/');
  expect(home.headers()['x-robots-tag']).toContain('noindex');
});
