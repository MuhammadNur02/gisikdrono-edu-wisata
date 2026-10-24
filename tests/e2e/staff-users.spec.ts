import { expect, test } from '@playwright/test';

import {
  ADMIN_RW05,
  AUTH_STEP,
  hasHorizontalScroll,
  resetAuthLimits,
  signInToDashboard,
  SUPERADMIN,
} from './helpers/staff';

// Task P4.8.03 and P4.10.02: the staff list and the security screens are the superadmin's; an RW officer opening their
// address is told so. The phone project checks the pages at 360 px.

test.describe.configure({ timeout: 120_000 });

test.beforeAll(async () => {
  await resetAuthLimits();
});

test('the superadmin sees every account, their own marked, and the security screens', async ({
  page,
}) => {
  await signInToDashboard(page, SUPERADMIN);

  await page.goto('/dashboard/users');
  await expect(page.getByRole('heading', { name: 'Pengguna', level: 1 })).toBeVisible(AUTH_STEP);
  await expect(page.getByText(SUPERADMIN).filter({ visible: true }).first()).toBeVisible();
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
  await signInToDashboard(page, ADMIN_RW05);
  for (const path of ['/dashboard/users', '/dashboard/security-alerts', '/dashboard/audit-logs']) {
    await page.goto(path);
    await expect(page.getByText('Halaman ini hanya untuk Superadmin Kelurahan.')).toBeVisible(
      AUTH_STEP,
    );
  }
  await expect(page.getByRole('button', { name: 'Undang petugas' })).toHaveCount(0);
});
