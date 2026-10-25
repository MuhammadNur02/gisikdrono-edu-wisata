import { readFile } from 'node:fs/promises';

import { expect, test } from '@playwright/test';

import {
  AUTH_STEP,
  createRwAdmin,
  createSuperadmin,
  resetAuthLimits,
  signInToDashboard,
} from './helpers/staff';

// Task P4.6.02, P4.6.03 (docs/Security.md §7.5; AUD-04, DATA-06): the superadmin exports the visits of the last 30 days
// as CSV through /dashboard/exports, gets the file with its BOM and watermark at once and sees it in the history; an RW
// officer is refused the finance export by api/export/finance and offered the attendance of their own RW only. Each
// test signs in as an account of its own, which stays behind with the exports row that names it (exports keep who
// asked, and security_events is append-only).

test.describe.configure({ timeout: 120_000 });

const PURPOSE = 'Rekap kunjungan uji E2E untuk laporan bulanan';
const UTF8_BOM = '﻿';

test.beforeAll(async () => {
  await resetAuthLimits();
});

test('the superadmin exports a CSV, downloads it at once and sees it in the history', async ({
  page,
}) => {
  const { email } = await createSuperadmin();
  await signInToDashboard(page, email);
  await page.goto('/dashboard/exports');
  await expect(page.getByRole('heading', { name: 'Ekspor data', level: 1 })).toBeVisible(AUTH_STEP);

  await page.getByRole('button', { name: 'Ekspor baru' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Ekspor data baru' });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel(/Tujuan ekspor/).fill(PURPOSE);

  const downloading = page.waitForEvent('download', AUTH_STEP);
  await dialog.getByRole('button', { name: 'Buat dan unduh' }).click();
  const download = await downloading;
  expect(download.suggestedFilename()).toMatch(/^ekspor-\d{8}-\d{6}-visits\.csv$/);
  const csv = await readFile(await download.path(), 'utf8');
  expect(csv.startsWith(UTF8_BOM)).toBe(true);
  expect(csv).toContain('Kode reservasi');
  expect(csv).toContain('Diekspor oleh Superadmin Uji E2E');

  await page.reload();
  await expect(page.getByText(PURPOSE).filter({ visible: true }).first()).toBeVisible(AUTH_STEP);
  await expect(page.getByRole('link', { name: /^Unduh lagi/ }).first()).toBeVisible();
});

test('an RW officer is refused the finance export and offered their own attendance only', async ({
  page,
  baseURL,
}) => {
  const { email } = await createRwAdmin(5);
  await signInToDashboard(page, email);

  const refused = await page.request.post('/api/export/finance', {
    headers: { origin: baseURL ?? '' },
    data: { format: 'csv', from: '2026-10-01', to: '2026-10-31', purpose: PURPOSE },
  });
  expect(refused.status()).toBe(403);

  await page.goto('/dashboard/exports');
  // The page description, in the main landmark; Next.js can hold a second, hidden copy of a streamed segment.
  await expect(page.getByRole('main').getByText(/rekap kehadiran RW Anda/)).toBeVisible(AUTH_STEP);
  await page.getByRole('button', { name: 'Ekspor baru' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Ekspor data baru' });
  await expect(dialog.getByRole('combobox', { name: /Jenis data/ })).toHaveText('Kehadiran');
  await expect(dialog.getByRole('combobox', { name: /Jenis data/ })).toBeDisabled();
  await expect(dialog.getByRole('combobox', { name: /Kampung/ })).toHaveCount(0);
});
