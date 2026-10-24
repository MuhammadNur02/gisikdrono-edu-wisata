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

// The camera policy a document allows, read the way the browser enforces it (document.permissionsPolicy, or the
// older featurePolicy Chromium still has).
function cameraAllowed(page: Page): Promise<boolean | null> {
  return page.evaluate(() => {
    const policy: unknown =
      Reflect.get(document, 'permissionsPolicy') ?? Reflect.get(document, 'featurePolicy');
    if (typeof policy !== 'object' || policy === null) return null;
    const allowsFeature: unknown = Reflect.get(policy, 'allowsFeature');
    return typeof allowsFeature === 'function'
      ? Boolean(allowsFeature.call(policy, 'camera'))
      : null;
  });
}

async function followSidebar(page: Page, label: string, isDesktop: boolean) {
  if (!isDesktop) await page.getByRole('button', { name: 'Buka menu dasbor' }).click();
  const nav = page.getByRole('navigation', { name: 'Menu dasbor' }).filter({ visible: true });
  await nav.getByRole('link', { name: label, exact: true }).click();
}

// Review of PR #49 (CLAUDE.md §7.4, HDR-03): a browser keeps the policies of the document it loaded first, so the way
// into the scanner and the way out of it are both document loads. No camera mock here: it would skip the very check.
test('the sidebar loads the scanner as a document of its own, and leaves it the same way', async ({
  page,
}, testInfo) => {
  const isDesktop = testInfo.project.name === 'desktop';
  await signInToDashboard(page, officerEmail());
  expect(await cameraAllowed(page)).toBe(false);

  const scannerDocument = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === SCANNER &&
      response.request().resourceType() === 'document',
  );
  await followSidebar(page, 'Scanner', isDesktop);
  expect((await scannerDocument).headers()['permissions-policy']).toContain('camera=(self)');
  await expect(page).toHaveURL(SCANNER);
  expect(await cameraAllowed(page)).toBe(true);
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute(
    'href',
    '/scanner.webmanifest',
  );

  const dashboardDocument = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === '/dashboard' &&
      response.request().resourceType() === 'document',
  );
  await followSidebar(page, 'Dasbor', isDesktop);
  expect((await dashboardDocument).headers()['permissions-policy']).toContain('camera=()');
  await expect(page).toHaveURL('/dashboard');
  expect(await cameraAllowed(page)).toBe(false);
});
