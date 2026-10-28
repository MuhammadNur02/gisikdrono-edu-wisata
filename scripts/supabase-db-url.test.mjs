import { describe, expect, it } from 'vitest';

import {
  escapeCommandValue,
  githubEnvLines,
  libpqExports,
  parseSupabaseDbUrl,
  requireJobRole,
} from './supabase-db-url.mjs';

const REF = 'abcdefghijklmnopqrst';
const OTHER_REF = 'zyxwvutsrqponmlkjihg';
const DIRECT_HOST = `db.${REF}.supabase.co:5432`;
const POOLER_HOST = 'aws-0-ap-southeast-1.pooler.supabase.com:5432';
const CR = String.fromCharCode(13);
const LF = String.fromCharCode(10);

// A connection string built from its parts, so no credential-shaped literal sits in the source for the secret
// scanners to report (semgrep p/secrets, gitleaks).
function dbUrl({
  scheme = 'postgresql',
  user = 'postgres',
  password = 'fixture',
  host = DIRECT_HOST,
  query = '',
}) {
  const url = new URL(`${scheme}://${host}/postgres${query}`);
  url.username = user;
  url.password = password;
  return url.href;
}

describe('scripts/supabase-db-url.mjs', () => {
  it('reads the ref and the decoded password of a direct URL', () => {
    expect(parseSupabaseDbUrl(dbUrl({ password: 'p@ss:w0rd' }))).toEqual({
      ref: REF,
      password: 'p@ss:w0rd',
      user: 'postgres',
      host: `db.${REF}.supabase.co`,
      port: '5432',
      database: 'postgres',
    });
  });

  it('refuses any parameter but sslmode, a root certificate or client key above all', () => {
    for (const query of [
      '?sslrootcert=/tmp/ca.crt',
      '?sslcert=x',
      '?sslkey=x',
      '?host=evil.example',
    ]) {
      expect(() => parseSupabaseDbUrl(dbUrl({ query }))).toThrow(/leave every parameter out/);
    }
  });

  it('hands one step libpq variables, quoted for the shell, and no URL', () => {
    const target = parseSupabaseDbUrl(
      dbUrl({ user: `gisikdrono_backup.${REF}`, password: "it's $x", host: POOLER_HOST }),
    );
    expect(libpqExports(target)).toBe(
      [
        "export PGHOST='aws-0-ap-southeast-1.pooler.supabase.com'",
        "export PGPORT='5432'",
        "export PGDATABASE='postgres'",
        `export PGUSER='gisikdrono_backup.${REF}'`,
        `export PGPASSWORD='it'\\''s $x'`,
        `export SUPABASE_DB_PASSWORD='it'\\''s $x'`,
        '',
      ].join(LF),
    );
  });

  it('reads the ref of a pooler URL from its user, for the backup role too', () => {
    const release = dbUrl({ scheme: 'postgres', user: `postgres.${REF}`, host: POOLER_HOST });
    const backup = dbUrl({ user: `gisikdrono_backup.${REF}`, host: POOLER_HOST });
    expect(parseSupabaseDbUrl(release).ref).toBe(REF);
    expect(parseSupabaseDbUrl(backup).ref).toBe(REF);
  });

  it('lets the backup connect as gisikdrono_backup and the release as postgres, nothing else', () => {
    const urlOf = (user) => parseSupabaseDbUrl(dbUrl({ user, host: POOLER_HOST }));
    expect(() => requireJobRole(urlOf(`gisikdrono_backup.${REF}`), '--backup')).not.toThrow();
    expect(() => requireJobRole(urlOf(`postgres.${REF}`), '--release')).not.toThrow();
    for (const user of [`postgres.${REF}`, `gisikdrono_backupx.${REF}`, `backup_reader.${REF}`]) {
      expect(() => requireJobRole(urlOf(user), '--backup')).toThrow(/gisikdrono_backup/);
    }
    expect(() => requireJobRole(urlOf(`gisikdrono_backup.${REF}`), '--release')).toThrow(
      /postgres/,
    );
    expect(() => requireJobRole(urlOf(`postgres.${REF}`), '--ref-only')).toThrow(/unknown job/);
  });

  it('accepts sslmode=verify-full and refuses a weaker one', () => {
    expect(parseSupabaseDbUrl(dbUrl({ query: '?sslmode=verify-full' })).ref).toBe(REF);
    expect(() => parseSupabaseDbUrl(dbUrl({ query: '?sslmode=require' }))).toThrow(
      /sslmode=require/,
    );
  });

  it('refuses what names no project, two projects, no password or another scheme', () => {
    expect(() => parseSupabaseDbUrl(dbUrl({ host: 'example.test:5432' }))).toThrow(
      /names no Supabase project/,
    );
    expect(() => parseSupabaseDbUrl(dbUrl({ user: `postgres.${OTHER_REF}` }))).toThrow(
      /two different projects/,
    );
    expect(() => parseSupabaseDbUrl(dbUrl({ password: '' }))).toThrow(/no password/);
    expect(() => parseSupabaseDbUrl(`https://db.${REF}.supabase.co`)).toThrow(/postgresql/);
    expect(() => parseSupabaseDbUrl('not a url')).toThrow(/not a URL/);
  });

  it('refuses a password with a line break, either kind', () => {
    expect(() => parseSupabaseDbUrl(dbUrl({ password: `a${CR}b` }))).toThrow(/line break/);
    expect(() => parseSupabaseDbUrl(dbUrl({ password: `a${LF}b` }))).toThrow(/line break/);
  });

  it('never puts any part of the URL in its error messages', () => {
    const password = 'fixture-password-to-hide';
    const messages = [
      dbUrl({ password, host: 'example.test' }),
      dbUrl({ scheme: 'mysql', password }),
    ].map((url) => {
      try {
        parseSupabaseDbUrl(url);
        return '';
      } catch (error) {
        return error instanceof Error ? error.message : '';
      }
    });
    expect(messages.join(' ')).not.toContain(password);
  });

  it('masks the password and hands the job the ref alone', () => {
    expect(githubEnvLines({ ref: REF, password: 'fixture' })).toEqual({
      log: `::add-mask::fixture${LF}`,
      env: `PROJECT_REF=${REF}${LF}`,
    });
  });

  it('escapes the mask as GitHub unescapes a workflow command', () => {
    expect(escapeCommandValue('50%off')).toBe('50%25off');
    expect(escapeCommandValue('%0A')).toBe('%250A');
    expect(escapeCommandValue(`a${CR}b${LF}c`)).toBe('a%0Db%0Ac');
    expect(githubEnvLines({ ref: REF, password: 'p%ss' }).log).toBe(`::add-mask::p%25ss${LF}`);
  });
});
