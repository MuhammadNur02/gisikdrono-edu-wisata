import { describe, expect, it } from 'vitest';

import { githubEnvLines, parseSupabaseDbUrl } from './supabase-db-url.mjs';

const REF = 'abcdefghijklmnopqrst';

describe('scripts/supabase-db-url.mjs', () => {
  it('reads the ref and the decoded password of a direct URL', () => {
    expect(
      parseSupabaseDbUrl(`postgresql://postgres:p%40ss%3Aw0rd@db.${REF}.supabase.co:5432/postgres`),
    ).toEqual({
      ref: REF,
      password: 'p@ss:w0rd',
    });
  });

  it('reads the ref of a pooler URL from its user', () => {
    const url = `postgres://postgres.${REF}:secret@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres`;
    expect(parseSupabaseDbUrl(url).ref).toBe(REF);
  });

  it('accepts sslmode=verify-full and refuses a weaker one', () => {
    const base = `postgresql://postgres:secret@db.${REF}.supabase.co:5432/postgres`;
    expect(parseSupabaseDbUrl(`${base}?sslmode=verify-full`).ref).toBe(REF);
    expect(() => parseSupabaseDbUrl(`${base}?sslmode=require`)).toThrow(/sslmode=require/);
  });

  it('refuses what names no project, two projects, no password or another scheme', () => {
    expect(() =>
      parseSupabaseDbUrl('postgresql://postgres:secret@example.test:5432/postgres'),
    ).toThrow(/names no Supabase project/);
    const other = 'zyxwvutsrqponmlkjihg';
    expect(() =>
      parseSupabaseDbUrl(
        `postgresql://postgres.${other}:secret@db.${REF}.supabase.co:5432/postgres`,
      ),
    ).toThrow(/two different projects/);
    expect(() =>
      parseSupabaseDbUrl(`postgresql://postgres@db.${REF}.supabase.co:5432/postgres`),
    ).toThrow(/no password/);
    expect(() => parseSupabaseDbUrl(`https://db.${REF}.supabase.co`)).toThrow(/postgresql/);
    expect(() => parseSupabaseDbUrl('not a url')).toThrow(/not a URL/);
  });

  it('never puts any part of the URL in its error messages', () => {
    const secret = 'super-secret-password';
    const messages = [
      `postgresql://postgres:${secret}@example.test/postgres`,
      `mysql://u:${secret}@h/d`,
    ].map((url) => {
      try {
        parseSupabaseDbUrl(url);
        return '';
      } catch (error) {
        return error instanceof Error ? error.message : '';
      }
    });
    expect(messages.join(' ')).not.toContain(secret);
  });

  it('masks the password before it hands it to the later steps', () => {
    expect(githubEnvLines({ ref: REF, password: 'secret' })).toEqual({
      log: '::add-mask::secret\n',
      env: `PROJECT_REF=${REF}\nSUPABASE_DB_PASSWORD=secret\n`,
    });
  });
});
