import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { DEV_ACCOUNTS, DEV_ONLY_PASSWORD, DEV_ONLY_TOTP_SECRET, totpCode } from './dev-accounts.ts';
import { isLocalSupabaseUrl } from './local-stack.ts';

const seedSql = readFileSync(fileURLToPath(new URL('./seed-dev.sql', import.meta.url)), 'utf8');

// The SQL statements of seed-dev.sql, comments left out and whitespace folded.
function statementsOf(sql) {
  return sql
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n')
    .split(';')
    .map((statement) => statement.replace(/\s+/g, ' ').trim())
    .filter((statement) => statement !== '');
}

describe('scripts/seed-dev.sql', () => {
  it('marks a fresh local database, then refuses any database not marked local before it writes anything', () => {
    expect(statementsOf(seedSql).slice(0, 2)).toEqual([
      "select vault.create_secret('local', 'environment') where not exists (select 1 from vault.secrets where name = 'environment')",
      'select internal.require_local_database()',
    ]);
  });

  it('holds no DEV-ONLY credential itself, only the accounts they open', () => {
    expect(seedSql).not.toContain(DEV_ONLY_PASSWORD);
    expect(seedSql).not.toContain(DEV_ONLY_TOTP_SECRET);
    expect(seedSql).toContain("current_setting('dev_seed.password')");
    expect(seedSql).toContain("current_setting('dev_seed.totp_secret')");
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
