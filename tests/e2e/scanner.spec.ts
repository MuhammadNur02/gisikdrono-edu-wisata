import { expect, test, type Page } from '@playwright/test';

import { answerScans, ownRwOfficerPerTest, dropScans, SCANNER } from './helpers/scanner';
import { hasHorizontalScroll, signInToDashboard } from './helpers/staff';

// Task P4.4.05 (docs/PRD.md FR-SCAN-03..07, docs/StyleGuide.md §6.6): the scanner page against the contract of
// POST /api/tickets/verify, answered by tests/e2e/helpers/scanner.ts. The live camera has its own file
// (scanner-camera.spec.ts), since its browser flags need a browser of their own.

async function checkManually(page: Page) {
  await page.getByRole('tab', { name: 'Kode manual' }).click();
  await page.getByLabel('Kode pemesanan').fill('gsk 7f3k-9q2m');
  await page.getByLabel('4 digit terakhir nomor WhatsApp').fill('4321');
  await page.getByRole('button', { name: 'Periksa' }).click();
}

// Requests a service worker makes are out of page.route's reach, so the scanner's worker stays off here.
test.use({ serviceWorkers: 'block' });

const officerEmail = ownRwOfficerPerTest();

test('an RW officer checks a group in by its code, with one person more than booked', async ({
  page,
}) => {
  await signInToDashboard(page, officerEmail());
  const response = await page.goto(SCANNER);
  expect(response?.headers()['permissions-policy']).toContain('camera=(self)');
  expect(await hasHorizontalScroll(page)).toBe(false);
  const sent = await answerScans(page, () => 'ok');

  await checkManually(page);
  const sheet = page.getByRole('dialog');
  await expect(sheet.getByRole('alert')).toContainText('Tiket valid');
  await expect(sheet).toContainText('SD Negeri Gisikdrono 01');
  await sheet.getByRole('button', { name: 'Tambah satu' }).click();
  await expect(sheet).toContainText('Kelebihan 1 orang dicatat sebagai belum dibayar.');
  await sheet.getByRole('button', { name: 'Konfirmasi Check-in' }).click();
  await expect(sheet.getByRole('alert')).toContainText(
    'Check-in berhasil: SD Negeri Gisikdrono 01 · 31 orang',
  );

  expect(sent.map((scan) => scan.mode)).toEqual(['preview', 'commit']);
  expect(sent[0]?.bookingCode).toBe('GSK-7F3K9Q2M');
  expect(sent[1]?.attemptId).toBe(sent[0]?.attemptId);
  expect(sent[1]?.attendeeCount).toBe(31);
  // The sheet's own button comes before the dialog's corner X, which is also named Tutup.
  await sheet.getByRole('button', { name: 'Tutup', exact: true }).first().click();
  const recent = page.getByRole('region', { name: 'Pemindaian terakhir' });
  await expect(recent.getByText('Tiket valid')).toBeVisible();
});

test('a second scan of a used ticket and a ticket of another RW only offer Tutup', async ({
  page,
}) => {
  await signInToDashboard(page, officerEmail());
  await page.goto(SCANNER);
  await answerScans(page, (_scan, index) => (index === 0 ? 'already_used' : 'wrong_rw'));

  await checkManually(page);
  const sheet = page.getByRole('dialog');
  await expect(sheet.getByRole('alert')).toContainText('Tiket sudah dipakai');
  await expect(sheet).toContainText('oleh Budi');
  await expect(sheet.getByRole('button', { name: 'Konfirmasi Check-in' })).toHaveCount(0);
  // The sheet's own button comes before the dialog's corner X, which is also named Tutup.
  await sheet.getByRole('button', { name: 'Tutup', exact: true }).first().click();

  await page.getByRole('button', { name: 'Periksa' }).click();
  await expect(sheet.getByRole('alert')).toContainText('Tiket untuk RW lain');
  await expect(sheet.getByRole('button', { name: 'Override' })).toHaveCount(0);
});

test('without a network the officer is told so, and Coba lagi sends the same attempt', async ({
  page,
}) => {
  await signInToDashboard(page, officerEmail());
  await page.goto(SCANNER);
  const attempts = await dropScans(page);

  await checkManually(page);
  const sheet = page.getByRole('dialog');
  await expect(sheet.getByRole('alert')).toContainText('Tidak ada sinyal — coba lagi.');
  await sheet.getByRole('button', { name: 'Coba lagi' }).click();
  await expect(sheet.getByRole('alert')).toContainText('Tidak ada sinyal');
  expect(attempts).toHaveLength(2);
  expect(attempts[1]).toBe(attempts[0]);
});
