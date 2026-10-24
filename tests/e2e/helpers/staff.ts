import { randomUUID } from 'node:crypto';

import type { Page } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

import { DEV_ONLY_PASSWORD, DEV_ONLY_TOTP_SECRET, totpCode } from '../../../scripts/dev-accounts';
import { localStack, runSql } from '../../../scripts/local-stack';

// Staff sign-in through the real pages against the local stack of pnpm db:seed, with the DEV-ONLY accounts and,
// where a test needs an account the seed does not have, a throwaway one that removeAccounts() deletes again.

export const SUPERADMIN = 'superadmin@dev.gisikdrono.test';
export const ADMIN_RW05 = 'admin-rw05@dev.gisikdrono.test';

// A sign-in step runs the limiter and Supabase Auth with both of its hooks; on a laptop's Docker that can take a few
// seconds, longer than expect()'s default.
export const AUTH_STEP = { timeout: 30_000 };

function adminClient() {
  const { apiUrl, serviceRoleKey } = localStack();
  return createClient(apiUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// The local limiter remembers earlier runs (login:ip allows 10 in 5 minutes, password_reset:ip+email 3 an hour), so
// each file starts without them.
export async function resetAuthLimits(): Promise<void> {
  await runSql(
    "delete from public.rate_limit_buckets where key like 'login:%' or key like 'password_reset:%'",
  );
}

export async function waitForTurnstile(page: Page): Promise<void> {
  await page.waitForFunction(() =>
    Boolean(document.querySelector<HTMLInputElement>('input[name="cf-turnstile-response"]')?.value),
  );
}

export async function submitPassword(page: Page, email: string, password = DEV_ONLY_PASSWORD) {
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Kata sandi').fill(password);
  await waitForTurnstile(page);
  await page.getByRole('button', { name: 'Masuk' }).click();
}

export async function submitTotp(page: Page, secret = DEV_ONLY_TOTP_SECRET) {
  await page.getByLabel('Kode autentikator').fill(totpCode(secret));
  await waitForTurnstile(page);
  await page.getByRole('button', { name: 'Verifikasi' }).click();
}

// Password and TOTP code: the whole way into the dashboard.
export async function signInToDashboard(page: Page, email: string): Promise<void> {
  await page.goto('/login');
  await submitPassword(page, email);
  await page.waitForURL(/\/mfa\/verify/, AUTH_STEP);
  await submitTotp(page);
  await page.waitForURL(/\/dashboard$/, AUTH_STEP);
}

// An Auth user with the DEV-ONLY password and no factor; with a role, also the profile onboarding would give it.
export async function createAccount(
  role: 'admin_rw' | 'none',
): Promise<{ id: string; email: string }> {
  const email = `e2e-${randomUUID()}@example.test`;
  const { data, error } = await adminClient().auth.admin.createUser({
    email,
    password: DEV_ONLY_PASSWORD,
    email_confirm: true,
  });
  if (error) throw error;
  if (role === 'admin_rw') {
    await runSql(`insert into public.profiles (id, email, full_name, role, rw_id, is_active, claims_version)
      values ('${data.user.id}', '${email}', 'Admin Uji E2E', 'admin_rw', 5, true, 1)`);
  }
  return { id: data.user.id, email };
}

// A throwaway superadmin with the DEV-ONLY TOTP factor already verified, made the way scripts/seed-dev.sql makes the
// seeded one. For a spec that runs beside staff-sign-in.spec.ts, whose "Keluar" signs the seeded superadmin out
// everywhere (signOutEverywhere) and, in another worker, can end a sign-in half-way.
export async function createSuperadmin(): Promise<{ id: string; email: string }> {
  const account = await createAccount('none');
  await runSql(`begin;
    insert into auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at, secret)
      values (gen_random_uuid(), '${account.id}', 'DEV-ONLY authenticator', 'totp', 'verified', now(), now(),
              '${DEV_ONLY_TOTP_SECRET}');
    insert into public.profiles (id, email, full_name, role, rw_id, is_active, claims_version)
      values ('${account.id}', '${account.email}', 'Superadmin Uji E2E', 'superadmin', null, true, 1);
    commit;`);
  return account;
}

// Login attempts and security events are append-only, so they go under the retention flag, as the integration
// suites do; deleting the Auth user takes its factors and sessions with it.
export async function removeAccounts(userIds: readonly string[]): Promise<void> {
  if (userIds.length === 0) return;
  const ids = `'{${userIds.join(',')}}'::uuid[]`;
  await runSql(`begin;
    select set_config('app.purge', 'on', true);
    delete from public.login_attempts where user_id = any(${ids});
    delete from public.security_events where actor_id = any(${ids});
    delete from public.profiles where id = any(${ids});
    commit;`);
  for (const userId of userIds) {
    const { error } = await adminClient().auth.admin.deleteUser(userId);
    if (error) throw error;
  }
}

export async function hasHorizontalScroll(page: Page): Promise<boolean> {
  return page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
}
