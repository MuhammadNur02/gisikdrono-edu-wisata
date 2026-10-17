import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';

import type { Database } from '@/db/types';

import { DEV_ONLY_PASSWORD, DEV_ONLY_TOTP_SECRET, totpCode } from '../../../scripts/dev-accounts';
import { localStack, runSql } from '../../../scripts/local-stack';

// Signs the development staff accounts of pnpm db:seed in through GoTrue, the way the dashboard does, so a suite
// gets real access tokens minted by the real access-token hook. Suites remove the traces sign-ins leave, so the
// pgTAP suites meet the database as the seed left it.

export type ApiClient = SupabaseClient<Database>;

const DEV_EMAIL_PATTERN = '%@dev.gisikdrono.test';

const claimsSchema = z.object({
  aal: z.string(),
  app_role: z.string(),
  app_rw_id: z.number().nullable(),
  claims_version: z.number(),
  user_metadata: z.record(z.string(), z.unknown()).optional(),
});

export type AccessClaims = z.infer<typeof claimsSchema>;

export function claimsOf(accessToken: string): AccessClaims {
  const payload = accessToken.split('.')[1] ?? '';
  return claimsSchema.parse(JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')));
}

export function anonClient(): ApiClient {
  const { apiUrl, anonKey } = localStack();
  return createClient<Database>(apiUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function signInWithPassword(email: string, password: string): Promise<ApiClient> {
  const client = anonClient();
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return client;
}

// Password first, then the TOTP step, which lifts the session to AAL2.
export async function signInDevAccount(email: string): Promise<ApiClient> {
  const client = await signInWithPassword(email, DEV_ONLY_PASSWORD);
  const factors = await client.auth.mfa.listFactors();
  const { error } = await client.auth.mfa.challengeAndVerify({
    factorId: factors.data?.totp[0]?.id ?? '',
    code: totpCode(DEV_ONLY_TOTP_SECRET),
  });
  if (error) throw error;
  return client;
}

export async function accessTokenOf(client: ApiClient): Promise<string> {
  const { data } = await client.auth.getSession();
  return data.session?.access_token ?? '';
}

export async function lastAuditId(): Promise<number> {
  const rows = await runSql('select coalesce(max(id), 0) as id from public.audit_logs');
  return z.array(z.object({ id: z.coerce.number() })).parse(rows)[0]?.id ?? 0;
}

// The login attempts, audit rows, MFA challenges and sessions that signing in left behind, for the development
// accounts and any other user the suite names. One query string is one transaction, so the purge switch ends with it.
export async function removeSignInTraces(
  auditIdBefore: number,
  otherUserIds: string[] = [],
): Promise<void> {
  const users = `(select id from auth.users where email like '${DEV_EMAIL_PATTERN}'
                  or id = any (array[${otherUserIds.map((id) => `'${id}'`).join(', ')}]::uuid[]))`;
  await runSql(`select set_config('app.purge', 'on', true);
    delete from public.login_attempts where user_id in ${users};
    delete from public.audit_logs where id > ${String(auditIdBefore)};
    delete from auth.mfa_challenges where factor_id in (select f.id from auth.mfa_factors f where f.user_id in ${users});
    delete from auth.sessions where user_id in ${users};`);
}
