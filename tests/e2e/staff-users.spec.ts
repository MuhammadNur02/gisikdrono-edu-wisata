import { expect, test, type Page } from '@playwright/test';

import {
  AUTH_STEP,
  createAccount,
  hasHorizontalScroll,
  removeAccounts,
  resetAuthLimits,
  submitPassword,
} from './helpers/staff';
import { totpCode } from '../../scripts/dev-accounts';

// Task P4.8.03 and P4.10.02: the staff list and the security screens are the superadmin's; an RW officer opening their
// address is told so. The phone project checks the pages at 360 px.
//
// Each test signs in with an account of its own. Signing in to the shared seed superadmin here, in parallel workers,
// ended the AAL1 session of staff-sign-in.spec.ts's flow on the same account in the first run of PR #43 (Supabase Auth
// can drop an account's lower-assurance sessions when another of its sessions verifies a TOTP code), so this file
// never touches the seed accounts.

test.describe.configure({ timeout: 120_000 });

const createdAccounts: string[] = [];

test.beforeAll(async () => {
  await resetAuthLimits();
});

test.afterAll(async () => {
  await removeAccounts(createdAccounts);
});

// A new account enrols its authenticator from the QR code, as onboarding will, and lands on the dashboard.
async function signInAsNew(page: Page, role: 'superadmin' | 'admin_rw'): Promise<string> {
  const account = await createAccount(role);
  createdAccounts.push(account.id);
  await page.goto('/login');
  await submitPassword(page, account.email);
  await expect(page).toHaveURL('/mfa/enroll', AUTH_STEP);
  await page.getByRole('button', { name: 'Tampilkan kode QR' }).click();
  const secret = (await page.locator('code').innerText()).replace(/\s/g, '');
  await page.getByLabel('Kode autentikator').fill(totpCode(secret));
  await page.getByRole('button', { name: 'Aktifkan' }).click();
  await expect(page).toHaveURL('/dashboard', AUTH_STEP);
  return account.email;
}

test('the superadmin sees every account, their own marked, and the security screens', async ({
  page,
}) => {
  const email = await signInAsNew(page, 'superadmin');

  await page.goto('/dashboard/users');
  await expect(page.getByRole('heading', { name: 'Pengguna', level: 1 })).toBeVisible(AUTH_STEP);
  await expect(page.getByText(email).filter({ visible: true }).first()).toBeVisible();
  await expect(page.getByText('(Anda)').filter({ visible: true }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Undang petugas' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Undangan terbuka' })).toBeVisible();
  expect(await hasHorizontalScroll(page)).toBe(false);

  await page.goto('/dashboard/security-alerts');
  await expect(page.getByRole('heading', { name: 'Peringatan Keamanan', level: 1 })).toBeVisible();
  await expect(page.getByLabel('Tingkat')).toBeVisible();
  expect(await hasHorizontalScroll(page)).toBe(false);

  await page.goto('/dashboard/audit-logs?entity=profiles');
  await expect(page.getByRole('heading', { name: 'Catatan Aktivitas', level: 1 })).toBeVisible();
  await expect(page.getByLabel('Tabel')).toHaveValue('profiles');
  expect(await hasHorizontalScroll(page)).toBe(false);
});

test('an RW officer is told the staff and security screens are the superadmin’s', async ({
  page,
}) => {
  await signInAsNew(page, 'admin_rw');
  for (const path of ['/dashboard/users', '/dashboard/security-alerts', '/dashboard/audit-logs']) {
    await page.goto(path);
    await expect(page.getByText('Halaman ini hanya untuk Superadmin Kelurahan.')).toBeVisible(
      AUTH_STEP,
    );
  }
  await expect(page.getByRole('button', { name: 'Undang petugas' })).toHaveCount(0);
});
