import { describe, expect, it } from 'vitest';

import { githubEnvLines, parseSupabaseDbUrl } from './supabase-db-url.mjs';

const REF = 'abcdefghijklmnopqrst';
const OTHER_REF = 'zyxwvutsrqponmlkjihg';
const DIRECT_HOST = `db.${REF}.supabase.co:5432`;

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
    });
  });

  it('reads the ref of a pooler URL from its user', () => {
    const url = dbUrl({
      scheme: 'postgres',
      user: `postgres.${REF}`,
      host: 'aws-0-ap-southeast-1.pooler.supabase.com:5432',
    });
    expect(parseSupabaseDbUrl(url).ref).toBe(REF);
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

  it('masks the password before it hands it to the later steps', () => {
    expect(githubEnvLines({ ref: REF, password: 'fixture' })).toEqual({
      log: '::add-mask::fixture\n',
      env: `PROJECT_REF=${REF}\nSUPABASE_DB_PASSWORD=fixture\n`,
    });
  });
});
