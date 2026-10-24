import { expect, test, type APIRequestContext } from '@playwright/test';

// Task P5.6.02: the metadata audit as a test. Every address the sitemap lists (the static public pages plus each
// published package, product, article and e-booklet, CLAUDE.md §5.6) is fetched from the production build CI
// serves and must carry its canonical, the title template, an Open Graph image that renders and JSON-LD that
// parses. Plain requests, no browser, so it runs once on the desktop project.

const SITE_NAME = 'Edu Wisata Gisikdrono';
const TITLE_SUFFIX = ` | ${SITE_NAME}`;
const SCHEMA_CONTEXT = 'https://schema.org';
// The kinds whose pages draw their own Open Graph image (opengraph-image.tsx next to the page).
const OWN_OG_IMAGE_PREFIXES = ['/paket-wisata/', '/produk/', '/artikel/'];

test.skip(({ isMobile }) => isMobile, 'requests only; one project is enough');

function firstMatch(html: string, pattern: RegExp): string | undefined {
  return pattern.exec(html)?.[1];
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
  const response = await request.get(new URL(url).pathname + new URL(url).search);
  expect(response.status(), url).toBe(200);
  expect(response.headers()['content-type'], url).toMatch(/^image\//);
}

test('the sitemap lists the home page and the seeded package and products', async ({ request }) => {
  const paths = await sitemapPaths(request);
  expect(paths).toContain('/');
  expect(paths).toContain('/paket-wisata/paket-eduwisata-ecowastreme');
  expect(paths.some((path) => path.startsWith('/produk/'))).toBe(true);
});

test('every sitemap page has its canonical, the title template, an OG image and valid JSON-LD', async ({
  request,
}) => {
  test.setTimeout(120_000);
  for (const path of await sitemapPaths(request)) {
    const response = await request.get(path);
    expect(response.status(), path).toBe(200);
    const html = await response.text();

    const canonical = firstMatch(html, /<link rel="canonical" href="([^"]+)"/);
    expect(canonical && new URL(canonical).pathname, `${path} canonical`).toBe(path);

    const title = firstMatch(html, /<title>([^<]*)<\/title>/);
    if (path === '/') expect(title).toBe(SITE_NAME);
    else expect(title?.endsWith(TITLE_SUFFIX), `${path} title "${title ?? ''}"`).toBe(true);

    const ogImage = firstMatch(html, /<meta property="og:image" content="([^"]+)"/);
    expect(ogImage, `${path} og:image`).toBeDefined();
    if (
      ogImage &&
      (path === '/' || OWN_OG_IMAGE_PREFIXES.some((prefix) => path.startsWith(prefix)))
    ) {
      await expectImage(request, ogImage);
    }

    for (const block of jsonLdBlocks(html)) {
      expect(block, `${path} JSON-LD`).toMatchObject({ '@context': SCHEMA_CONTEXT });
    }
  }
});

// Preview, staging and the CI build are not production (VERCEL_ENV), so nothing may be indexed there.
test('a non-production build keeps every crawler out', async ({ request }) => {
  const robots = await request.get('/robots.txt');
  expect(await robots.text()).toMatch(/Disallow: \/\s*$/m);
  const home = await request.get('/');
  expect(home.headers()['x-robots-tag']).toContain('noindex');
});
