import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

// supabase/config.toml holds the local stack's API and Auth settings, which staging and production mirror in their
// dashboards (Task P1.7). This reads the few values the security model relies on, so a later edit cannot loosen
// them unnoticed (Task P1.7.05, docs/Security.md §6.2, §6.6).
const configPath = fileURLToPath(new URL('../supabase/config.toml', import.meta.url));

// Enough TOML for this file: [section] headers and single-line `key = value` pairs of strings, numbers,
// booleans and arrays of strings.
function readConfig(text) {
  const sections = new Map();
  let current = '';
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === '' || line.startsWith('#')) continue;
    const header = /^\[([^\]]+)\]$/.exec(line);
    if (header) {
      current = header[1];
      continue;
    }
    const pair = /^([A-Za-z0-9_]+)\s*=\s*(.+)$/.exec(line);
    if (!pair) continue;
    const values = sections.get(current) ?? {};
    values[pair[1]] = JSON.parse(pair[2]);
    sections.set(current, values);
  }
  return (section) => sections.get(section) ?? {};
}

const config = readConfig(readFileSync(configPath, 'utf8'));

describe('supabase/config.toml', () => {
  it('exposes the public schema only, at most 100 rows a request', () => {
    expect(config('api').schemas).toEqual(['public']);
    expect(config('api').max_rows).toBe(100);
  });

  it('keeps staff accounts invite-only, with strong passwords and 15-minute tokens', () => {
    expect(config('auth').enable_signup).toBe(false);
    expect(config('auth').enable_anonymous_sign_ins).toBe(false);
    expect(config('auth').minimum_password_length).toBeGreaterThanOrEqual(12);
    expect(config('auth').password_requirements).toBe('lower_upper_letters_digits_symbols');
    expect(config('auth').jwt_expiry).toBe(900);
    expect(config('auth').additional_redirect_urls).toEqual([
      'http://127.0.0.1:3000/auth/callback',
    ]);
  });

  it('asks every staff member for TOTP and never for a phone code', () => {
    expect(config('auth.mfa.totp')).toMatchObject({ enroll_enabled: true, verify_enabled: true });
    expect(config('auth.mfa.phone')).toMatchObject({
      enroll_enabled: false,
      verify_enabled: false,
    });
  });

  it('seeds nothing on reset, so a reset of a linked project never writes development data', () => {
    expect(config('db.seed')).toEqual({ enabled: false, sql_paths: [] });
    expect(existsSync(fileURLToPath(new URL('../supabase/seed.sql', import.meta.url)))).toBe(false);
  });

  it('resizes images like the Pro plan, which the public image loader relies on', () => {
    expect(config('storage.image_transformation')).toEqual({ enabled: true });
  });

  it('runs the access-token and password-attempt hooks of 0004', () => {
    expect(config('auth.hook.custom_access_token')).toEqual({
      enabled: true,
      uri: 'pg-functions://postgres/public/custom_access_token_hook',
    });
    expect(config('auth.hook.password_verification_attempt')).toEqual({
      enabled: true,
      uri: 'pg-functions://postgres/public/hook_password_verification_attempt',
    });
  });
});
