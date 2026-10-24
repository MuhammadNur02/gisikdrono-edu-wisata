import { expect, test } from '@playwright/test';
import { z } from 'zod';

import { paidTicketToday, unsignedTokenFor } from './helpers/gate';
import { SCANNER, showQrToCamera } from './helpers/scanner';
import { createRwAdmin, resetAuthLimits, signInToDashboard } from './helpers/staff';
import { runSql } from '../../scripts/local-stack';

// Task P4.4.05 (docs/PRD.md FR-SCAN-03..07; CLAUDE.md §7.4): the scanner page against the real POST
// /api/tickets/verify, validate_ticket and check_in_ticket. A preview, a commit and a second scan of the same ticket
// that reads already_used; and an RW 05 officer scanning a ticket of RW 13, which reads wrong_rw and shows nothing of
// the group. Each test signs in as an RW 05 officer of its own; the officer stays behind with the scans that name them
// (ticket_scans keeps who scanned), as the paid bookings do.

// Requests a service worker makes are out of page.route's reach, and the camera test replaces getUserMedia.
test.use({ serviceWorkers: 'block', permissions: ['camera'] });

let officerEmail = '';

test.beforeAll(async () => {
  await resetAuthLimits();
});

test.beforeEach(async () => {
  officerEmail = (await createRwAdmin(5)).email;
});

async function ticketState(ticketId: string) {
  const rows = z
    .array(z.object({ status: z.string(), checked_in_pax: z.number().nullable() }))
    .parse(
      await runSql(`select status, checked_in_pax from public.tickets_qr where id = '${ticketId}'`),
    );
  return rows[0];
}

test('a group is let in by its code once, and a second scan reads already used', async ({
  page,
}) => {
  const ticket = await paidTicketToday(5);
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

  // The sheet's own button comes before the dialog's corner X, which is also named Tutup.
  await sheet.getByRole('button', { name: 'Tutup', exact: true }).first().click();
  await page.getByRole('button', { name: 'Periksa' }).click();
  await expect(sheet.getByRole('alert')).toContainText('Tiket sudah dipakai');
  await expect(sheet).toContainText('Admin RW Uji E2E');
  await expect(sheet.getByRole('button', { name: 'Konfirmasi Check-in' })).toHaveCount(0);
});

test('a ticket of another RW reads wrong RW at an RW 05 gate and stays unused', async ({
  page,
}) => {
  const ticket = await paidTicketToday(13);
  await showQrToCamera(page, unsignedTokenFor(ticket.ticketId));
  await signInToDashboard(page, officerEmail);
  await page.goto(SCANNER);

  await page.getByRole('button', { name: 'Nyalakan kamera' }).click();
  await expect(page.locator('video')).toBeVisible();
  await page.getByRole('button', { name: 'Scan', exact: true }).click();
  const sheet = page.getByRole('dialog');
  await expect(sheet.getByRole('alert')).toContainText('Tiket untuk RW lain', { timeout: 15_000 });
  await expect(sheet).not.toContainText(ticket.institutionName);
  await expect(sheet.getByRole('button', { name: 'Override' })).toHaveCount(0);
  await expect(sheet.getByRole('button', { name: 'Konfirmasi Check-in' })).toHaveCount(0);
  expect(await ticketState(ticket.ticketId)).toEqual({ status: 'issued', checked_in_pax: null });
});
