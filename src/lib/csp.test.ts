import { describe, expect, it } from 'vitest';

import { buildContentSecurityPolicy, isPrivateRoute, permissionsPolicyFor } from '@/lib/csp';

const privateProduction = {
  nonce: 'abc123',
  supabaseUrl: 'https://projectref.supabase.co',
  isDevelopment: false,
};
const publicProduction = { ...privateProduction, nonce: null };

function directive(policy: string, name: string): string | undefined {
  return policy.split('; ').find((part) => part.startsWith(`${name} `) || part === name);
}

describe('buildContentSecurityPolicy on private routes', () => {
  it('locks scripts to the nonce, with no unsafe-inline or unsafe-eval', () => {
    const policy = buildContentSecurityPolicy(privateProduction);
    expect(directive(policy, 'script-src')).toBe(
      "script-src 'self' 'nonce-abc123' 'strict-dynamic' 'wasm-unsafe-eval' https://challenges.cloudflare.com",
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

describe('buildContentSecurityPolicy on public ISR pages', () => {
  it('allows inline scripts from our own origin but no nonce, strict-dynamic or eval', () => {
    const scripts = directive(buildContentSecurityPolicy(publicProduction), 'script-src');
    expect(scripts).toBe("script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com");
  });

  it('keeps every other directive as strict as on private routes', () => {
    const withoutScripts = (policy: string) =>
      policy
        .split('; ')
        .filter((part) => !part.startsWith('script-src'))
        .join('; ');
    expect(withoutScripts(buildContentSecurityPolicy(publicProduction))).toBe(
      withoutScripts(buildContentSecurityPolicy(privateProduction)),
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
