import { randomUUID } from 'node:crypto';

import { createClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';

import { localStack, runSql } from '../../scripts/local-stack';

// Signs in through GoTrue on the local stack with both hooks enabled in supabase/config.toml, so the
// hooks run exactly as Auth calls them (docs/Security.md §5.5). Profiles keep their auth user
// (ON DELETE RESTRICT), so every test makes its own account with a fresh address, and the suite removes
// everything it wrote afterwards, so the pgTAP suites always meet the database as the migrations left it.

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

const createdUserIds: string[] = [];

function adminClient() {
  const { apiUrl, serviceRoleKey } = localStack();
  return createClient(apiUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function createAccount(): Promise<{ id: string; email: string }> {
  const email = `hook-${randomUUID()}@example.test`;
  const { data, error } = await adminClient().auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
  });
  if (error) throw error;
  createdUserIds.push(data.user.id);
  return { id: data.user.id, email };
}

async function lastAuditId(): Promise<number> {
  const rows = await runSql('select coalesce(max(id), 0) as id from public.audit_logs');
  return z.array(z.object({ id: z.coerce.number() })).parse(rows)[0]?.id ?? 0;
}

// Login attempts, security events and audit rows are append-only, so they go under the retention flag.
// The audit log is hash-chained: only the rows after the suite began are removed, which keeps the chain
// whole, and integration files run one at a time (vitest.config.ts) so no other suite's rows are among them.
async function removeWhatTheSuiteWrote(auditIdBefore: number, rwUnitCreated: boolean) {
  const userIds = `'{${createdUserIds.join(',')}}'::uuid[]`;
  await runSql(`begin;
    select set_config('app.purge', 'on', true);
    delete from public.login_attempts where user_id = any(${userIds});
    delete from public.security_events where actor_id = any(${userIds});
    delete from public.profiles where id = any(${userIds});
    ${rwUnitCreated ? 'delete from public.rw_units where id = 5;' : ''}
    delete from public.audit_logs where id > ${String(auditIdBefore)};
    commit;`);
  for (const userId of createdUserIds) {
    const { error } = await adminClient().auth.admin.deleteUser(userId);
    if (error) throw error;
  }
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
  let auditIdBefore = 0;
  let rwUnitCreated = false;

  beforeAll(async () => {
    auditIdBefore = await lastAuditId();
    const inserted = await runSql(`insert into public.rw_units
        (id, code, slug, name, short_name, theme_label, accent_key, icon_key, is_active)
      values (5, 'RW05', 'rw-05-ecowastreme', 'RW 05 Ecowastreme', 'Ecowastreme', 'Ekowisata & Lingkungan',
        'leaf', 'recycle', true)
      on conflict (id) do nothing returning id`);
    rwUnitCreated = inserted.length > 0;
  });

  afterAll(async () => {
    await removeWhatTheSuiteWrote(auditIdBefore, rwUnitCreated);
  }, SLOW_TEST_MS);

  it('signs a staff member in with the role, RW and claims_version of their profile', async () => {
    const account = await createAccount();
    // handle_new_auth_user gave the account a profile without a role (20261029080000); this one replaces it.
    await runSql(`select set_config('app.purge', 'on', true);
      delete from public.profiles where id = '${account.id}';
      insert into public.profiles (id, email, full_name, role, rw_id, is_active, claims_version)
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
