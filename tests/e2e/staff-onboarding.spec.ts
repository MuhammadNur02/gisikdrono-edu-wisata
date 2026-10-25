import { randomUUID } from 'node:crypto';

import { expect, test, type Browser, type Page } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';

import { waitForAuthLink } from './helpers/mailbox';
import {
  AUTH_STEP,
  createSuperadmin,
  removeAccounts,
  resetAuthLimits,
  signInToDashboard,
  submitPassword,
} from './helpers/staff';
import { DEV_ONLY_TOTP_SECRET, totpCode } from '../../scripts/dev-accounts';
import { localStack, runSql } from '../../scripts/local-stack';
import { copy } from '../../src/lib/copy/id';
import { staffCopy } from '../../src/lib/copy/staff';

// Task P4.8.01 (docs/Security.md §5.1, §5.2): the superadmin invites an RW officer on /dashboard/users; the invite
// email opens /onboarding, where the code read out by the superadmin comes first, then the authenticator, then the
// password; the officer then signs in like any staff member. Abuse cases: an invite that lapsed shows no form, and a
// factor enrolled straight through GoTrue without the code is never verified. Desktop only: the flow is the same on a
// phone, and the auth pages are checked at 360 px by staff-sign-in.spec.ts.

test.describe.configure({ timeout: 240_000 });

const TOTP_STEP_MS = 30_000;
const NEW_PASSWORD = 'Petugas-baru-2026!';
const createdAccounts: string[] = [];

let superadmin: { id: string; email: string } | undefined;

function inviter(): { id: string; email: string } {
  if (!superadmin) throw new Error('beforeAll made no superadmin');
  return superadmin;
}

test.beforeAll(async ({}, testInfo) => {
  if (testInfo.project.name !== 'desktop') return;
  await resetAuthLimits();
  superadmin = await createSuperadmin();
  createdAccounts.push(superadmin.id);
});

test.afterAll(async () => {
  await removeAccounts(createdAccounts);
});

test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'one run of the flow is enough');
});

// The verification hook refuses a code used once already in its window, so a second step waits for the next one.
async function nextTotpCode(secret: string, used: string): Promise<string> {
  const deadline = Date.now() + TOTP_STEP_MS + AUTH_STEP.timeout;
  while (totpCode(secret) === used && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  return totpCode(secret);
}

const userIdSchema = z.array(z.object({ id: z.uuid() }));

async function accountIdOf(email: string): Promise<string | null> {
  const rows = userIdSchema.parse(
    await runSql(`select id from auth.users where email = '${email}'`),
  );
  return rows[0]?.id ?? null;
}

// The superadmin's invite on /dashboard/users, confirmed with a fresh authenticator code: the code the card shows once.
async function inviteRwOfficer(page: Page, email: string): Promise<string> {
  await signInToDashboard(page, inviter().email);
  const signInCode = totpCode(DEV_ONLY_TOTP_SECRET);
  await page.goto('/dashboard/users');
  await page.getByRole('button', { name: 'Undang petugas' }).click();
  await page.getByLabel('Email petugas').fill(email);
  await page.getByRole('combobox', { name: 'RW' }).click();
  await page.getByRole('option', { name: /RW 05/ }).click();
  await page
    .getByLabel('Kode autentikator')
    .fill(await nextTotpCode(DEV_ONLY_TOTP_SECRET, signInCode));
  await page.getByRole('button', { name: 'Buat undangan' }).click();
  const spoken = page.getByText(/^Kode undangan, 20 karakter: /);
  await expect(spoken).toBeAttached(AUTH_STEP);
  await expect(page.getByText(staffCopy.invite.emailSent)).toBeVisible();
  return (await spoken.innerText()).replace(/^Kode undangan, 20 karakter: /, '').replace(/\s/g, '');
}

async function openInviteLink(browser: Browser, email: string, since: Date): Promise<Page> {
  const link = await waitForAuthLink(email, since);
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(link);
  return page;
}

test('an invited RW officer onboards with the code, an authenticator and a password, then signs in', async ({
  page,
  browser,
}) => {
  const email = `petugas-${randomUUID()}@example.test`;
  const invitedAt = new Date();
  const inviteCode = await inviteRwOfficer(page, email);

  const officer = await openInviteLink(browser, email, invitedAt);
  await expect(officer).toHaveURL('/onboarding', AUTH_STEP);
  const accountId = await accountIdOf(email);
  if (accountId) createdAccounts.push(accountId);
  await officer.getByLabel('Kode undangan').fill(inviteCode);
  await officer.getByRole('button', { name: 'Lanjut' }).click();
  const secret = (await officer.locator('code').innerText(AUTH_STEP)).replace(/\s/g, '');
  const enrolCode = totpCode(secret);
  await officer.getByLabel('Kode autentikator').fill(enrolCode);
  await officer.getByLabel(/^Kata sandi baru/).fill(NEW_PASSWORD);
  await officer.getByLabel('Ulangi kata sandi baru').fill(NEW_PASSWORD);
  await officer.getByRole('button', { name: 'Selesaikan pendaftaran' }).click();
  await expect(officer).toHaveURL('/login?info=onboarding-done', AUTH_STEP);
  await expect(officer.getByText(copy.auth.signIn.notices['onboarding-done'])).toBeVisible();

  await submitPassword(officer, email, NEW_PASSWORD);
  await expect(officer).toHaveURL(/\/mfa\/verify/, AUTH_STEP);
  await officer.getByLabel('Kode autentikator').fill(await nextTotpCode(secret, enrolCode));
  await officer.getByRole('button', { name: 'Verifikasi' }).click();
  await expect(officer).toHaveURL('/dashboard', AUTH_STEP);
  await officer.context().close();
});

test('an invite that lapsed before the code was typed shows no form', async ({ page, browser }) => {
  const email = `terlambat-${randomUUID()}@example.test`;
  const invitedAt = new Date();
  await inviteRwOfficer(page, email);
  await runSql(
    `update public.staff_invites set expires_at = now() - interval '1 second' where email = '${email}'`,
  );

  const late = await openInviteLink(browser, email, invitedAt);
  await expect(late).toHaveURL('/onboarding', AUTH_STEP);
  const accountId = await accountIdOf(email);
  if (accountId) createdAccounts.push(accountId);
  await expect(late.getByText(copy.auth.onboarding.noInviteTitle)).toBeVisible(AUTH_STEP);
  await expect(late.getByLabel('Kode undangan')).toHaveCount(0);
  await late.context().close();
});

// R28 and finding 2 of the onboarding review: the invite link is in the mailbox, the code is not. Enrolling and
// verifying a factor straight through GoTrue, past the app, is refused by mfa_factor_verification_guard.
test('a factor enrolled straight through GoTrue without the invite code is never verified', async () => {
  const email = `tanpa-kode-${randomUUID()}@example.test`;
  await runSql(`insert into public.staff_invites (email, role, rw_id, invite_code_hash, expires_at, created_by)
    values ('${email}', 'admin_rw', 5, '${randomUUID().replaceAll('-', '').repeat(2)}', now() + interval '1 hour',
            '${inviter().id}')`);
  const { apiUrl, anonKey, serviceRoleKey } = localStack();
  const admin = createClient(apiUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const link = await admin.auth.admin.generateLink({ type: 'invite', email });
  if (link.error) throw link.error;
  createdAccounts.push(link.data.user.id);
  const mailbox = createClient(apiUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const opened = await mailbox.auth.verifyOtp({
    type: 'invite',
    token_hash: link.data.properties.hashed_token,
  });
  if (opened.error) throw opened.error;

  const enrolled = await mailbox.auth.mfa.enroll({ factorType: 'totp' });
  if (enrolled.error) throw enrolled.error;
  const verified = await mailbox.auth.mfa.challengeAndVerify({
    factorId: enrolled.data.id,
    code: totpCode(enrolled.data.totp.secret),
  });

  expect(verified.error).not.toBeNull();
  const factors = z
    .array(z.object({ status: z.string() }))
    .parse(
      await runSql(
        `select status::text from auth.mfa_factors where user_id = '${link.data.user.id}'`,
      ),
    );
  expect(factors.map((factor) => factor.status)).not.toContain('verified');
});
