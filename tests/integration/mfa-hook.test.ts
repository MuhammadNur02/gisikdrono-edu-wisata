import { randomUUID } from 'node:crypto';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { afterAll, describe, expect, it } from 'vitest';
import { z } from 'zod';

import { giveRwRole, removeProfiles } from './helpers/staff-session';
import { totpCode } from '../../scripts/dev-accounts';
import { localStack, runSql } from '../../scripts/local-stack';

// The MFA verification hook through GoTrue on the local stack, enabled in supabase/config.toml, so it runs exactly as
// Auth calls it: also when a TOTP code is sent straight to /factors/{id}/verify with an AAL1 token, past the app and
// its Turnstile check (security review of PR #17, M1; docs/Security.md §5.5). Each test makes its own account, and
// the suite removes everything it wrote afterwards.

const PASSWORD = 'Mfa-hook-password-123!';
const LOCK_MESSAGE = 'Terlalu banyak kode yang salah';
const TOTP_STEP_MS = 30_000;
const SLOW_TEST_MS = 60_000;

const createdUserIds: string[] = [];

function adminClient() {
  const { apiUrl, serviceRoleKey } = localStack();
  return createClient(apiUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function signedInClient(email: string): Promise<SupabaseClient> {
  const { apiUrl, anonKey } = localStack();
  const client = createClient(apiUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw error;
  return client;
}

// A staff account with one verified TOTP factor, enrolled through GoTrue as /mfa/enroll does.
async function accountWithFactor(): Promise<{
  id: string;
  email: string;
  factorId: string;
  secret: string;
}> {
  const email = `mfa-hook-${randomUUID()}@example.test`;
  const { data, error } = await adminClient().auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
  });
  if (error) throw error;
  createdUserIds.push(data.user.id);
  await giveRwRole(data.user.id, email);

  const client = await signedInClient(email);
  const enrolled = await client.auth.mfa.enroll({ factorType: 'totp' });
  if (enrolled.error) throw enrolled.error;
  const { id: factorId, totp } = enrolled.data;
  const verified = await client.auth.mfa.challengeAndVerify({
    factorId,
    code: totpCode(totp.secret),
  });
  if (verified.error) throw verified.error;
  return { id: data.user.id, email, factorId, secret: totp.secret };
}

// A code the factor would refuse now and in the steps either side of it.
function wrongCode(secret: string): string {
  const valid = new Set(
    [-TOTP_STEP_MS, 0, TOTP_STEP_MS].map((offset) =>
      totpCode(secret, new Date(Date.now() + offset)),
    ),
  );
  let candidate = 0;
  while (valid.has(String(candidate).padStart(6, '0'))) candidate++;
  return String(candidate).padStart(6, '0');
}

async function eventsOf(userId: string): Promise<string[]> {
  const rows = await runSql(
    `select event_type from public.security_events where actor_id = '${userId}' order by id`,
  );
  return z
    .array(z.object({ event_type: z.string() }))
    .parse(rows)
    .map((row) => row.event_type);
}

// Security events are append-only, so they go under the retention flag, and so do the staff profiles; deleting the
// Auth user takes its factors and sessions with it.
async function removeWhatTheSuiteWrote() {
  const userIds = `'{${createdUserIds.join(',')}}'::uuid[]`;
  await runSql(`begin;
    select set_config('app.purge', 'on', true);
    delete from public.login_attempts where user_id = any(${userIds});
    delete from public.security_events where actor_id = any(${userIds});
    delete from public.security_alerts where fingerprint in (select 'mfa_locked:' || id from unnest(${userIds}) id);
    commit;`);
  await removeProfiles(createdUserIds);
  for (const userId of createdUserIds) {
    const { error } = await adminClient().auth.admin.deleteUser(userId);
    if (error) throw error;
  }
}

describe('MFA verification hook through GoTrue', () => {
  afterAll(async () => {
    await removeWhatTheSuiteWrote();
  }, SLOW_TEST_MS);

  it(
    'lets the right code through and records no failure',
    async () => {
      const account = await accountWithFactor();
      const client = await signedInClient(account.email);

      const { error } = await client.auth.mfa.challengeAndVerify({
        factorId: account.factorId,
        code: totpCode(account.secret),
      });

      expect(error).toBeNull();
      // The enrolment verified a new factor, which is an mfa_enrolled event (20261029080200); a later sign-in
      // with the same factor is not.
      expect(await eventsOf(account.id)).toEqual(['mfa_enrolled']);
    },
    SLOW_TEST_MS,
  );

  it(
    'locks the account after five wrong codes sent straight to GoTrue, even against the right one',
    async () => {
      const account = await accountWithFactor();
      const guesser = await signedInClient(account.email);
      const guess = (code: string) =>
        guesser.auth.mfa.challengeAndVerify({ factorId: account.factorId, code });

      for (let attempt = 1; attempt <= 4; attempt++) {
        expect((await guess(wrongCode(account.secret))).error?.code).toBe(
          'mfa_verification_failed',
        );
      }
      const fifth = await guess(wrongCode(account.secret));

      expect(fifth.error?.code).toBe('mfa_verification_rejected');
      expect(fifth.error?.message).toContain(LOCK_MESSAGE);
      // On a rejection Supabase Auth ends every session of the account, the guesser's AAL1 session included
      // (measured on the local stack), so the next try needs the password again.
      const sessions = await runSql(
        `select count(*)::int as count from auth.sessions where user_id = '${account.id}'`,
      );
      expect(sessions).toEqual([{ count: 0 }]);

      const signedInAgain = await signedInClient(account.email);
      const rightCode = await signedInAgain.auth.mfa.challengeAndVerify({
        factorId: account.factorId,
        code: totpCode(account.secret),
      });
      expect(rightCode.error?.code).toBe('mfa_verification_rejected');
      expect(await eventsOf(account.id)).toEqual([
        'mfa_enrolled',
        'mfa_failed',
        'mfa_failed',
        'mfa_failed',
        'mfa_failed',
        'mfa_failed',
        'mfa_locked',
      ]);
      const alerts = await runSql(`select severity, occurrences from public.security_alerts
        where fingerprint = 'mfa_locked:${account.id}' and acknowledged_at is null`);
      expect(alerts).toEqual([{ severity: 'high', occurrences: 2 }]);
    },
    SLOW_TEST_MS,
  );
});
