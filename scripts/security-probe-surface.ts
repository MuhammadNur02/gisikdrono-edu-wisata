import { expectStatus, guarded, type Probe, type ProbeCheck } from './security-probe-client';
import {
  cspModeOf,
  headerProblems,
  HTTP,
  robotsProblems,
  scriptChunksOf,
  sitemapProblems,
  sourceMapProblems,
} from './security-probe-rules';

// What any visitor's browser receives (Task P5.2.02, docs/Security.md §8.2, CLAUDE.md §5.6, §7.8): the headers of
// a public page, a dashboard redirect, a booking page and the API; the crawler files; no source maps; no file of the
// repository or the build served by path.

const HEADER_PATHS = ['/', '/dashboard', '/reservasi/x', '/api/health', '/login', '/v/x'];
const LEAK_PATHS = [
  '/.env',
  '/.env.local',
  '/.env.production',
  '/.git/HEAD',
  '/.git/config',
  '/.vercel/project.json',
  '/package.json',
  '/next.config.ts',
  '/supabase/config.toml',
];
// A handful of chunks is enough to see whether the build ships maps at all (productionBrowserSourceMaps: false).
const MAX_CHUNKS = 5;

function headerChecks(probe: Probe): ProbeCheck[] {
  return HEADER_PATHS.map((path) =>
    guarded(`headers of ${path}`, async () => {
      const response = await probe.request(path);
      const note = `status ${String(response.status)}, CSP ${cspModeOf(response.headers)}`;
      return { problems: headerProblems(path, response.headers, probe.isProduction), note };
    }),
  );
}

function crawlerChecks(probe: Probe): ProbeCheck[] {
  return [
    guarded('robots.txt disallows the private paths', async () => {
      const response = await probe.request('/robots.txt');
      return [...expectStatus(response, [HTTP.ok]), ...robotsProblems(await response.text())];
    }),
    guarded('sitemap.xml lists no private route', async () => {
      const response = await probe.request('/sitemap.xml');
      return [...expectStatus(response, [HTTP.ok]), ...sitemapProblems(await response.text())];
    }),
  ];
}

async function chunkProblems(probe: Probe, chunk: string): Promise<string[]> {
  const map = await probe.request(`${chunk}.map`);
  const script = await probe.request(chunk);
  return sourceMapProblems(chunk, map.status, await script.text());
}

function sourceMapCheck(probe: Probe): ProbeCheck {
  return guarded('no source maps under /_next/static', async () => {
    const home = await probe.request('/');
    const chunks = scriptChunksOf(await home.text()).slice(0, MAX_CHUNKS);
    if (chunks.length === 0) return ['the home page names no /_next/static script to check'];
    const problems: string[] = [];
    for (const chunk of chunks) problems.push(...(await chunkProblems(probe, chunk)));
    return { problems, note: `${String(chunks.length)} chunks checked` };
  });
}

function leakChecks(probe: Probe): ProbeCheck[] {
  return LEAK_PATHS.map((path) =>
    guarded(`GET ${path} is a 404`, async () =>
      expectStatus(await probe.request(path), [HTTP.notFound]),
    ),
  );
}

// next.config.ts sets a custom loader, so the optimiser is not served; either way it never proxies another site.
function imageProxyCheck(probe: Probe): ProbeCheck {
  return guarded('the image optimiser proxies no outside address', async () => {
    const remote = encodeURIComponent('https://evil.example/a.png');
    const response = await probe.request(`/_next/image?url=${remote}&w=640&q=75`);
    const isImage = (response.headers.get('content-type') ?? '').startsWith('image/');
    return [
      ...expectStatus(response, [HTTP.badRequest, HTTP.notFound]),
      ...(isImage ? ['an image came back'] : []),
    ];
  });
}

export function surfaceChecks(probe: Probe): ProbeCheck[] {
  return [
    ...headerChecks(probe),
    ...crawlerChecks(probe),
    sourceMapCheck(probe),
    ...leakChecks(probe),
    imageProxyCheck(probe),
  ];
}
