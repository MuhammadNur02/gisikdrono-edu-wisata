import { randomUUID } from 'node:crypto';

import { createClient } from '@supabase/supabase-js';
import { beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';

import { localStack, runSql } from './helpers/local-stack';

// Signs in through GoTrue on the local stack with both hooks enabled in supabase/config.toml, so the
// hooks run exactly as Auth calls them (docs/Security.md §5.5). Profiles keep their auth user
// (ON DELETE RESTRICT), so every test makes its own account with a fresh address.

const PASSWORD = 'Hook-test-password-123!';
const WRONG_PASSWORD = 'not-the-right-password';
const LOCKOUT_MESSAGE = 'Terlalu banyak percobaan';
const SLOW_TEST_MS = 30_000;

const staffClaimsSchema = z.object({
  app_role: z.string(),
  app_rw_id: z.number().nullable(),
  claims_version: z.number(),
});

function claimsOf(accessToken: string) {
  const payload = accessToken.split('.')[1] ?? '';
  return staffClaimsSchema.parse(JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')));
}

async function createAccount(): Promise<{ id: string; email: string }> {
  const { apiUrl, serviceRoleKey } = localStack();
  const admin = createClient(apiUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const email = `hook-${randomUUID()}@example.test`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
  });
  if (error) throw error;
  return { id: data.user.id, email };
}

function signIn(email: string, password: string) {
  const { apiUrl, anonKey } = localStack();
  const visitor = createClient(apiUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return visitor.auth.signInWithPassword({ email, password });
}

async function loginReasons(userId: string): Promise<string[]> {
  const rows = await runSql(
    `select reason from public.login_attempts where user_id = '${userId}' order by id`,
  );
  return z
    .array(z.object({ reason: z.string() }))
    .parse(rows)
    .map((row) => row.reason);
}

describe('Auth hooks through GoTrue', () => {
  beforeAll(async () => {
    await runSql(`insert into public.rw_units (id, code, slug, name, theme_label)
      values (5, 'RW05', 'rw-05-ecowastreme', 'RW 05 Ecowastreme', 'Ekowisata & Lingkungan')
      on conflict (id) do nothing`);
  });

  it('signs a staff member in with the role, RW and claims_version of their profile', async () => {
    const account = await createAccount();
    await runSql(`insert into public.profiles (id, email, full_name, role, rw_id, is_active, claims_version)
      values ('${account.id}', '${account.email}', 'Admin Uji', 'admin_rw', 5, true, 7)`);

    const { data, error } = await signIn(account.email, PASSWORD);

    expect(error).toBeNull();
    expect(claimsOf(data.session?.access_token ?? '')).toMatchObject({
      app_role: 'admin_rw',
      app_rw_id: 5,
      claims_version: 7,
    });
    expect(await loginReasons(account.id)).toEqual(['ok']);
  });

  it('gives an account without a staff profile no role', async () => {
    const account = await createAccount();

    const { data, error } = await signIn(account.email, PASSWORD);

    expect(error).toBeNull();
    expect(claimsOf(data.session?.access_token ?? '').app_role).toBe('none');
  });

  it('refuses a wrong password and records the attempt', async () => {
    const account = await createAccount();

    const { data, error } = await signIn(account.email, WRONG_PASSWORD);

    expect(data.session).toBeNull();
    expect(error).not.toBeNull();
    expect(await loginReasons(account.id)).toEqual(['bad_password']);
  });

  it(
    'locks the account after five wrong passwords, even against the right one',
    async () => {
      const account = await createAccount();
      for (let attempt = 1; attempt <= 5; attempt++) {
        const { error } = await signIn(account.email, WRONG_PASSWORD);
        expect(error).not.toBeNull();
      }

      const { data, error } = await signIn(account.email, PASSWORD);

      expect(data.session).toBeNull();
      expect(error?.message).toContain(LOCKOUT_MESSAGE);
      expect(await loginReasons(account.id)).toEqual([
        'bad_password',
        'bad_password',
        'bad_password',
        'bad_password',
        'locked',
        'locked',
      ]);
    },
    SLOW_TEST_MS,
  );
});
