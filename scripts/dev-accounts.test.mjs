import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  DEV_ACCOUNTS,
  DEV_ONLY_PASSWORD,
  DEV_ONLY_TOTP_SECRET,
  isLocalSupabaseUrl,
  totpCode,
} from './dev-accounts.ts';

const seedSql = readFileSync(
  fileURLToPath(new URL('../supabase/seed.sql', import.meta.url)),
  'utf8',
);

// The SQL statements of seed.sql, comments left out.
function statementsOf(sql) {
  return sql
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n')
    .split(';')
    .map((statement) => statement.trim())
    .filter((statement) => statement !== '');
}

describe('supabase/seed.sql', () => {
  it('refuses a staging or production database before it writes anything', () => {
    expect(statementsOf(seedSql)[0]).toBe('select internal.require_development_database()');
  });

  it('writes the DEV-ONLY credentials that README.md and pnpm db:seed give developers', () => {
    expect(seedSql).toContain(`'${DEV_ONLY_PASSWORD}'`);
    expect(seedSql).toContain(`'${DEV_ONLY_TOTP_SECRET}'`);
    for (const account of DEV_ACCOUNTS) expect(seedSql).toContain(`'${account.email}'`);
  });
});

describe('totpCode', () => {
  // RFC 6238 appendix B: the ASCII secret 12345678901234567890 in base32, six digits of the SHA-1 column.
  // A published test vector, not a secret.
  const rfcSecret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ'; // gitleaks:allow

  it.each([
    [59, '287082'],
    [1_111_111_109, '081804'],
    [1_234_567_890, '005924'],
    [20_000_000_000, '353130'],
  ])('matches the RFC 6238 test vector at %i s', (seconds, code) => {
    expect(totpCode(rfcSecret, new Date(seconds * 1000))).toBe(code);
  });

  it('refuses a secret that is not base32', () => {
    expect(() => totpCode('NOT-BASE32!')).toThrow('not a base32 character');
  });
});

describe('isLocalSupabaseUrl', () => {
  it.each([
    ['http://127.0.0.1:54321', true],
    ['http://localhost:54321', true],
    ['https://abcdefghijklmnop.supabase.co', false],
    ['http://127.0.0.1.example.test:54321', false],
  ])('%s is local: %s', (url, isLocal) => {
    expect(isLocalSupabaseUrl(url)).toBe(isLocal);
  });
});
