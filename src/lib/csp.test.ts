import { describe, expect, it } from 'vitest';

import {
  MACHINE_ROUTE_CSP,
  MACHINE_ROUTE_HEADERS,
  MACHINE_ROUTE_PERMISSIONS_POLICY,
  MACHINE_ROUTE_SOURCES,
} from '@/config/machine-routes';
import {
  buildContentSecurityPolicy,
  cspHeaderNameFor,
  ENFORCED_CSP_HEADER,
  isPrivateRoute,
  permissionsPolicyFor,
} from '@/lib/csp';

const privateProduction = {
  nonce: 'abc123',
  supabaseUrl: 'https://projectref.supabase.co',
  isDevelopment: false,
  pathname: '/dashboard',
};
const publicProduction = { ...privateProduction, nonce: null };

function directive(policy: string, name: string): string | undefined {
  return policy.split('; ').find((part) => part.startsWith(`${name} `) || part === name);
}

describe('buildContentSecurityPolicy on private routes', () => {
  it('locks scripts to the nonce, with no unsafe-inline or unsafe-eval', () => {
    const policy = buildContentSecurityPolicy(privateProduction);
    expect(directive(policy, 'script-src')).toBe(
      "script-src 'self' 'nonce-abc123' 'strict-dynamic' https://challenges.cloudflare.com",
    );
    expect(policy).toContain("frame-ancestors 'none'");
    expect(policy).toContain("object-src 'none'");
    expect(policy).toContain('upgrade-insecure-requests');
  });

  it('allows only our Supabase project for data and realtime', () => {
    const policy = buildContentSecurityPolicy(privateProduction);
    expect(directive(policy, 'connect-src')).toBe(
      "connect-src 'self' https://projectref.supabase.co wss://projectref.supabase.co https://challenges.cloudflare.com",
    );
  });

  it('never allows Midtrans, because payment runs in redirect mode', () => {
    expect(buildContentSecurityPolicy(privateProduction)).not.toContain('midtrans');
  });
});

describe('buildContentSecurityPolicy on the gate scanner', () => {
  it('allows WebAssembly for the ZXing reader there and nowhere else', () => {
    const scanner = { ...privateProduction, pathname: '/dashboard/scanner' };
    expect(directive(buildContentSecurityPolicy(scanner), 'script-src')).toContain(
      "'wasm-unsafe-eval'",
    );
    for (const pathname of ['/dashboard', '/dashboard/scanners', '/reservasi/GSK-7F3K9Q2M']) {
      const policy = buildContentSecurityPolicy({ ...privateProduction, pathname });
      expect(policy).not.toContain('wasm-unsafe-eval');
    }
    const publicScanner = { ...publicProduction, pathname: '/dashboard/scanner' };
    expect(buildContentSecurityPolicy(publicScanner)).not.toContain('wasm-unsafe-eval');
  });
});

describe('buildContentSecurityPolicy on public ISR pages', () => {
  it('allows inline scripts from our own origin but no nonce, strict-dynamic or eval', () => {
    const scripts = directive(buildContentSecurityPolicy(publicProduction), 'script-src');
    expect(scripts).toBe("script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com");
  });

  it('adds only the gallery YouTube player and its stills to frames and images', () => {
    const policy = buildContentSecurityPolicy(publicProduction);
    expect(directive(policy, 'frame-src')).toBe(
      'frame-src https://challenges.cloudflare.com https://www.google.com/maps/embed https://www.youtube-nocookie.com/embed/',
    );
    expect(directive(policy, 'img-src')).toBe(
      "img-src 'self' blob: https://projectref.supabase.co https://tile.openstreetmap.org https://i.ytimg.com/vi/",
    );
    expect(policy).not.toContain('https://www.youtube.com');
  });

  it('keeps YouTube off private routes', () => {
    expect(buildContentSecurityPolicy(privateProduction)).not.toMatch(/youtube|ytimg/);
  });

  it('keeps every other directive as strict as on private routes', () => {
    const withoutPublicExtras = (policy: string) =>
      policy
        .split('; ')
        .filter((part) => !/^(script|frame|img)-src /.test(part))
        .join('; ');
    expect(withoutPublicExtras(buildContentSecurityPolicy(publicProduction))).toBe(
      withoutPublicExtras(buildContentSecurityPolicy(privateProduction)),
    );
  });
});

describe('buildContentSecurityPolicy in development', () => {
  it('relaxes only what local development needs', () => {
    const policy = buildContentSecurityPolicy({
      ...privateProduction,
      supabaseUrl: 'http://127.0.0.1:54321',
      isDevelopment: true,
    });
    expect(directive(policy, 'script-src')).toContain("'unsafe-eval'");
    expect(directive(policy, 'connect-src')).toContain('ws://127.0.0.1:54321');
    expect(policy).not.toContain('upgrade-insecure-requests');
  });

  it('adds no third-party host, only eval for the dev server', () => {
    const development = buildContentSecurityPolicy({ ...privateProduction, isDevelopment: true });
    const hosts = (policy: string) => new Set(policy.match(/https?:\/\/[^\s;]+/g));
    expect(hosts(development)).toEqual(hosts(buildContentSecurityPolicy(privateProduction)));
    expect(development).not.toContain('vercel-scripts');
  });
});

describe('the allow-list as a whole', () => {
  // Task P5.4.01: Supabase, Turnstile, the OSM tiles, the Google Maps embed and, on public pages, the gallery's
  // YouTube player and stills. A new host here is a decision for docs/Security.md §8.2 first.
  const EXPECTED_HOSTS = [
    'https://projectref.supabase.co',
    'wss://projectref.supabase.co',
    'https://challenges.cloudflare.com',
    'https://tile.openstreetmap.org',
    'https://www.google.com/maps/embed',
    'https://www.youtube-nocookie.com/embed/',
    'https://i.ytimg.com/vi/',
  ];

  it('names no host beyond the documented ones', () => {
    const hosts = new Set(
      [privateProduction, publicProduction].flatMap(
        (options) => buildContentSecurityPolicy(options).match(/(?:https|wss):\/\/[^\s;]+/g) ?? [],
      ),
    );
    expect([...hosts].sort()).toEqual([...EXPECTED_HOSTS].sort());
  });

  it('keeps inline styles, never inline or eval scripts, on private routes', () => {
    const policy = buildContentSecurityPolicy(privateProduction);
    expect(directive(policy, 'style-src')).toBe("style-src 'self' 'unsafe-inline'");
    expect(directive(policy, 'script-src')).not.toMatch(/'unsafe-inline'|'unsafe-eval'/);
  });
});

describe('cspHeaderNameFor', () => {
  it('enforces the policy on production', () => {
    expect(cspHeaderNameFor('production')).toBe('Content-Security-Policy');
  });

  it('only reports on a preview deployment (staging, docs/Security.md §8.2)', () => {
    expect(cspHeaderNameFor('preview')).toBe('Content-Security-Policy-Report-Only');
  });

  it.each(['development', undefined] as const)(
    'enforces on %s builds, so CI sees violations',
    (env) => {
      expect(cspHeaderNameFor(env)).toBe('Content-Security-Policy');
    },
  );
});

describe('isPrivateRoute', () => {
  it.each([
    '/dashboard',
    '/dashboard/scanner',
    '/pesan/eduwisata-ecowastreme',
    '/reservasi/GSK-7F3K9Q2M/bayar',
    '/login',
    '/mfa/verify',
    '/auth/callback',
    '/v/GSK.k1.abc.def',
  ])('treats %s as private', (path) => {
    expect(isPrivateRoute(path)).toBe(true);
  });

  it.each([
    '/',
    '/paket-wisata',
    '/rw-05-ecowastreme',
    '/verifikasi/ABCDE12345',
    '/varia',
    '/loginx',
  ])('treats %s as a public page', (path) => {
    expect(isPrivateRoute(path)).toBe(false);
  });
});

describe('permissionsPolicyFor', () => {
  it('opens the camera on the scanner only', () => {
    expect(permissionsPolicyFor('/dashboard/scanner')).toMatch(/^camera=\(self\)/);
    expect(permissionsPolicyFor('/dashboard/scanner/manual')).toMatch(/^camera=\(self\)/);
  });

  it('keeps the camera off everywhere else, including look-alike paths', () => {
    for (const path of ['/', '/dashboard', '/dashboard/scanners', '/v/GSK.k1.abc']) {
      expect(permissionsPolicyFor(path)).toMatch(/^camera=\(\)/);
    }
  });
});

// Staging ZAP baseline and probe of 2026-10-29 (docs/security-tests.md): the routes the middleware skips get their
// headers from next.config.ts instead, and they must not drift from what the middleware gives every other route.
describe('the headers of the routes the middleware skips', () => {
  it('close the same features as every page but the scanner', () => {
    expect(MACHINE_ROUTE_PERMISSIONS_POLICY).toBe(permissionsPolicyFor('/api/health'));
  });

  it('allow no source and no framing, enforced on every deployment', () => {
    expect(MACHINE_ROUTE_CSP).toBe("default-src 'none'; object-src 'none'; frame-ancestors 'none'");
    expect(MACHINE_ROUTE_HEADERS).toEqual([
      { key: ENFORCED_CSP_HEADER, value: MACHINE_ROUTE_CSP },
      { key: 'Permissions-Policy', value: MACHINE_ROUTE_PERMISSIONS_POLICY },
    ]);
  });

  it('cover the webhooks, the jobs and the health check, and no page', () => {
    expect(MACHINE_ROUTE_SOURCES).toEqual([
      '/api/webhooks/:path*',
      '/api/jobs/:path*',
      '/api/health',
    ]);
  });
});
