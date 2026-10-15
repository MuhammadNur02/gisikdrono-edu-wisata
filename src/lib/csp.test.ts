import { describe, expect, it } from 'vitest';

import { buildContentSecurityPolicy, permissionsPolicyFor } from '@/lib/csp';

const production = {
  nonce: 'abc123',
  supabaseUrl: 'https://projectref.supabase.co',
  isDevelopment: false,
};

function directive(policy: string, name: string): string | undefined {
  return policy.split('; ').find((part) => part.startsWith(`${name} `) || part === name);
}

describe('buildContentSecurityPolicy', () => {
  it('locks scripts to the nonce in production, with no unsafe-eval', () => {
    const policy = buildContentSecurityPolicy(production);
    expect(directive(policy, 'script-src')).toBe(
      "script-src 'self' 'nonce-abc123' 'strict-dynamic' 'wasm-unsafe-eval' https://challenges.cloudflare.com",
    );
    expect(policy).toContain("frame-ancestors 'none'");
    expect(policy).toContain("object-src 'none'");
    expect(policy).toContain('upgrade-insecure-requests');
  });

  it('allows only our Supabase project for data and realtime', () => {
    const policy = buildContentSecurityPolicy(production);
    expect(directive(policy, 'connect-src')).toBe(
      "connect-src 'self' https://projectref.supabase.co wss://projectref.supabase.co https://challenges.cloudflare.com",
    );
  });

  it('relaxes only what local development needs', () => {
    const policy = buildContentSecurityPolicy({
      ...production,
      supabaseUrl: 'http://127.0.0.1:54321',
      isDevelopment: true,
    });
    expect(directive(policy, 'script-src')).toContain("'unsafe-eval'");
    expect(directive(policy, 'connect-src')).toContain('ws://127.0.0.1:54321');
    expect(policy).not.toContain('upgrade-insecure-requests');
  });

  it('never allows Midtrans, because payment runs in redirect mode', () => {
    expect(buildContentSecurityPolicy(production)).not.toContain('midtrans');
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
