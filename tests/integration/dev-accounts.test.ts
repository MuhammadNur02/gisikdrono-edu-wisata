import { createClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';

import {
  DEV_ACCOUNTS,
  DEV_ONLY_PASSWORD,
  DEV_ONLY_TOTP_SECRET,
  totpCode,
} from '../../scripts/dev-accounts';
import { localStack, runSql } from '../../scripts/local-stack';

// The development staff accounts of pnpm db:seed sign in through GoTrue with their DEV-ONLY password, pass
// the TOTP step and reach AAL2 with the role and RW of their profile, as a developer does (Task P1.8.02). The suite
// removes the sign-in traces it leaves, so the pgTAP suites meet the database as the seed left it.

const SLOW_TEST_MS = 30_000;
const DEV_EMAIL_PATTERN = '%@dev.gisikdrono.test';

const claimsSchema = z.object({
  aal: z.string(),
  app_role: z.string(),
  app_rw_id: z.number().nullable(),
  claims_version: z.number(),
});

function claimsOf(accessToken: string) {
  const payload = accessToken.split('.')[1] ?? '';
  return claimsSchema.parse(JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')));
}

function staffClient() {
  const { apiUrl, anonKey } = localStack();
  return createClient(apiUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function lastAuditId(): Promise<number> {
  const rows = await runSql('select coalesce(max(id), 0) as id from public.audit_logs');
  return z.array(z.object({ id: z.coerce.number() })).parse(rows)[0]?.id ?? 0;
}

async function removeSignInTraces(auditIdBefore: number): Promise<void> {
  await runSql(`begin;
    select set_config('app.purge', 'on', true);
    delete from public.login_attempts
      where user_id in (select id from auth.users where email like '${DEV_EMAIL_PATTERN}');
    delete from public.audit_logs where id > ${String(auditIdBefore)};
    commit;
    delete from auth.mfa_challenges
      where factor_id in (select f.id from auth.mfa_factors f join auth.users u on u.id = f.user_id
                          where u.email like '${DEV_EMAIL_PATTERN}');
    delete from auth.sessions where user_id in (select id from auth.users where email like '${DEV_EMAIL_PATTERN}');`);
}

describe('development staff accounts of pnpm db:seed', () => {
  let auditIdBefore = 0;

  beforeAll(async () => {
    auditIdBefore = await lastAuditId();
  });

  afterAll(async () => {
    await removeSignInTraces(auditIdBefore);
  }, SLOW_TEST_MS);

  it.each(DEV_ACCOUNTS)(
    '$email signs in, passes TOTP and reaches AAL2 as $role',
    async (account) => {
      const client = staffClient();
      const signIn = await client.auth.signInWithPassword({
        email: account.email,
        password: DEV_ONLY_PASSWORD,
      });
      expect(signIn.error).toBeNull();
      expect(claimsOf(signIn.data.session?.access_token ?? '').aal).toBe('aal1');

      const factors = await client.auth.mfa.listFactors();
      const factorId = factors.data?.totp[0]?.id ?? '';
      const verified = await client.auth.mfa.challengeAndVerify({
        factorId,
        code: totpCode(DEV_ONLY_TOTP_SECRET),
      });

      expect(verified.error).toBeNull();
      expect(claimsOf(verified.data?.access_token ?? '')).toEqual(
        expect.objectContaining({
          aal: 'aal2',
          app_role: account.role,
          app_rw_id: account.rwId,
          claims_version: 1,
        }),
      );
    },
    SLOW_TEST_MS,
  );
});
