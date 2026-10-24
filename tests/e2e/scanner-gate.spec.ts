import { expect, test, type Page } from '@playwright/test';
import { z } from 'zod';

import {
  paidTicketToday,
  removeUnbookedPackages,
  signedTokenFor,
  unsignedTokenFor,
} from './helpers/gate';
import { SCANNER, showQrToCamera } from './helpers/scanner';
import { createRwAdmin, resetAuthLimits, signInToDashboard } from './helpers/staff';
import { runSql } from '../../scripts/local-stack';
import { DUPLICATE_PAYLOAD_WINDOW_MS } from '../../src/config/scanner';

// Task P4.4.05 (docs/PRD.md FR-SCAN-03..07; CLAUDE.md §7.4): the scanner page against the real POST
// /api/tickets/verify and scan_ticket. A genuine signed QR read by the camera, committed, then scanned again and read
// as already used; the same by booking code; and an RW 05 officer scanning a ticket of RW 13, which reads wrong_rw and
// shows nothing of the group. Each test signs in as an RW 05 officer of its own; the officer stays behind with the
// scans that name them (ticket_scans keeps who scanned), as the paid bookings do.

// Requests a service worker makes are out of page.route's reach, and the camera tests replace getUserMedia.
test.use({ serviceWorkers: 'block', permissions: ['camera'] });

const SCAN_ANSWER = { timeout: 15_000 };
// The page ignores the same payload read again within this window (FR-SCAN-06).
const AFTER_DUPLICATE_WINDOW_MS = DUPLICATE_PAYLOAD_WINDOW_MS + 500;

let officerEmail = '';

test.beforeAll(async () => {
  await resetAuthLimits();
});

test.beforeEach(async () => {
  officerEmail = (await createRwAdmin(5)).email;
});

// Whatever a test made and no booking holds goes again, also after a failure.
test.afterAll(async () => {
  await removeUnbookedPackages();
});

async function ticketState(ticketId: string) {
  const rows = z
    .array(z.object({ status: z.string(), checked_in_pax: z.number().nullable() }))
    .parse(
      await runSql(`select status, checked_in_pax from public.tickets_qr where id = '${ticketId}'`),
    );
  return rows[0];
}

async function scanWithCamera(page: Page) {
  await page.getByRole('button', { name: 'Scan', exact: true }).click();
}

// The sheet's own button comes before the dialog's corner X, which is also named Tutup.
async function closeSheet(page: Page) {
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Tutup', exact: true })
    .first()
    .click();
}

test('a genuine QR lets a group in once, and a second scan reads already used', async ({
  page,
}, testInfo) => {
  const ticket = await paidTicketToday(5, testInfo);
  await showQrToCamera(page, signedTokenFor(ticket));
  await signInToDashboard(page, officerEmail);
  await page.goto(SCANNER);
  await page.getByRole('button', { name: 'Nyalakan kamera' }).click();
  await expect(page.locator('video')).toBeVisible();

  await scanWithCamera(page);
  const sheet = page.getByRole('dialog');
  await expect(sheet.getByRole('alert')).toContainText('Tiket valid', SCAN_ANSWER);
  await expect(sheet).toContainText(ticket.institutionName);
  await sheet.getByRole('button', { name: 'Konfirmasi Check-in' }).click();
  await expect(sheet.getByRole('alert')).toContainText('Check-in berhasil');
  expect(await ticketState(ticket.ticketId)).toEqual({
    status: 'used',
    checked_in_pax: ticket.paxCount,
  });

  await closeSheet(page);
  await page.waitForTimeout(AFTER_DUPLICATE_WINDOW_MS);
  await scanWithCamera(page);
  await expect(sheet.getByRole('alert')).toContainText('Tiket sudah dipakai', SCAN_ANSWER);
  await expect(sheet.getByRole('button', { name: 'Konfirmasi Check-in' })).toHaveCount(0);
});

test('a group is let in by its code once, and a second check reads already used', async ({
  page,
}, testInfo) => {
  const ticket = await paidTicketToday(5, testInfo);
  await signInToDashboard(page, officerEmail);
  await page.goto(SCANNER);

  await page.getByRole('tab', { name: 'Kode manual' }).click();
  await page.getByLabel('Kode pemesanan').fill(ticket.bookingCode.toLowerCase());
  await page.getByLabel('4 digit terakhir nomor WhatsApp').fill(ticket.phoneLastDigits);
  await page.getByRole('button', { name: 'Periksa' }).click();
  const sheet = page.getByRole('dialog');
  await expect(sheet.getByRole('alert')).toContainText('Tiket valid');
  await expect(sheet).toContainText(ticket.institutionName);

  await sheet.getByRole('button', { name: 'Konfirmasi Check-in' }).click();
  await expect(sheet.getByRole('alert')).toContainText(
    `Check-in berhasil: ${ticket.institutionName} · ${String(ticket.paxCount)} orang`,
  );
  expect(await ticketState(ticket.ticketId)).toEqual({
    status: 'used',
    checked_in_pax: ticket.paxCount,
  });

  await closeSheet(page);
  await page.getByRole('button', { name: 'Periksa' }).click();
  await expect(sheet.getByRole('alert')).toContainText('Tiket sudah dipakai');
  await expect(sheet).toContainText('Admin RW Uji E2E');
  await expect(sheet.getByRole('button', { name: 'Konfirmasi Check-in' })).toHaveCount(0);
});

test('a ticket of another RW reads wrong RW at an RW 05 gate and stays unused', async ({
  page,
}, testInfo) => {
  const ticket = await paidTicketToday(13, testInfo);
  await showQrToCamera(page, unsignedTokenFor(ticket.ticketId));
  await signInToDashboard(page, officerEmail);
  await page.goto(SCANNER);

  await page.getByRole('button', { name: 'Nyalakan kamera' }).click();
  await expect(page.locator('video')).toBeVisible();
  await scanWithCamera(page);
  const sheet = page.getByRole('dialog');
  await expect(sheet.getByRole('alert')).toContainText('Tiket untuk RW lain', SCAN_ANSWER);
  await expect(sheet).not.toContainText(ticket.institutionName);
  await expect(sheet.getByRole('button', { name: 'Override' })).toHaveCount(0);
  await expect(sheet.getByRole('button', { name: 'Konfirmasi Check-in' })).toHaveCount(0);
  expect(await ticketState(ticket.ticketId)).toEqual({ status: 'issued', checked_in_pax: null });
});
