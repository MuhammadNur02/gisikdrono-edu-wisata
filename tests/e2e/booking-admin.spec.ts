import { expect, test } from '@playwright/test';
import { z } from 'zod';

import { paidTicketToday, removeUnbookedPackages } from './helpers/gate';
import {
  AUTH_STEP,
  createRwAdmin,
  createSuperadmin,
  resetAuthLimits,
  signInToDashboard,
} from './helpers/staff';
import { runSql } from '../../scripts/local-stack';

// Task P4.3.02 (review of PR #75, F-75-7; docs/StyleGuide.md §6.10, docs/Security.md DATA-04, AZ-12): "Tampilkan kontak"
// on /dashboard/bookings/[id] asks for a reason, shows the real contact and leaves a pii_revealed event under the
// staff member's name; an RW officer opening another RW's booking gets a 404, since RLS hides the row. Each test signs
// in as an account of its own, which stays behind with the events that name it (security_events is append-only).

test.describe.configure({ timeout: 120_000 });

const REASON = 'Konfirmasi jadwal kedatangan rombongan';
const bookingRowsSchema = z.array(
  z.object({ id: z.uuid(), pic_phone: z.string(), phone_masked: z.string() }),
);
const countRowsSchema = z.array(z.object({ count: z.coerce.number() }));

// The booking behind the paid ticket, with its real phone and the mask v_bookings_staff shows (left 6, '••••', right 2;
// 0004_functions.sql). The helper books the visit 8 to 29 days after the database's own today_jkt(), so it lies inside
// the reveal window whatever the clock says.
async function bookingOf(bookingCode: string) {
  const [row] = bookingRowsSchema.parse(
    await runSql(`select b.id, b.pic_phone, b.phone_masked from public.bookings b
      where b.booking_code = '${bookingCode}'`),
  );
  if (!row) throw new Error('the paid booking is gone');
  return { id: row.id, phone: row.pic_phone, masked: row.phone_masked };
}

async function revealsOf(actorId: string, bookingId: string): Promise<number> {
  const [row] = countRowsSchema.parse(
    await runSql(`select count(*) from public.security_events e
      where e.event_type = 'pii_revealed' and e.actor_id = '${actorId}' and e.entity_id = '${bookingId}'`),
  );
  return row?.count ?? 0;
}

test.beforeAll(async () => {
  await resetAuthLimits();
});

test.afterEach(async () => {
  await removeUnbookedPackages();
});

test('revealing a booker’s contact asks for a reason and leaves a pii_revealed event', async ({
  page,
}, testInfo) => {
  const ticket = await paidTicketToday(5, testInfo);
  const booking = await bookingOf(ticket.bookingCode);
  const bookingId = booking.id;
  const superadmin = await createSuperadmin();
  await signInToDashboard(page, superadmin.email);

  await page.goto(`/dashboard/bookings/${bookingId}`);
  await expect(page.getByRole('heading', { name: ticket.bookingCode, level: 1 })).toBeVisible(
    AUTH_STEP,
  );
  await expect(page.getByText(booking.masked).first()).toBeVisible();
  await expect(page.getByText(booking.phone)).toHaveCount(0);
  expect(await revealsOf(superadmin.id, bookingId)).toBe(0);

  await page.getByRole('button', { name: 'Tampilkan kontak' }).click();
  const dialog = page.getByRole('dialog', { name: 'Tampilkan kontak pemesan' });
  await dialog.getByLabel(/Alasan/).fill(REASON);
  await dialog.getByRole('button', { name: 'Tampilkan' }).click();

  await expect(page.getByText('Siti Gerbang')).toBeVisible(AUTH_STEP);
  await expect(page.getByText(booking.phone).first()).toBeVisible();
  expect(await revealsOf(superadmin.id, bookingId)).toBe(1);
});

test('an RW officer cannot open a booking of another RW', async ({ page }, testInfo) => {
  const ticket = await paidTicketToday(5, testInfo);
  const booking = await bookingOf(ticket.bookingCode);
  const bookingId = booking.id;
  const officer = await createRwAdmin(13);
  await signInToDashboard(page, officer.email);

  const response = await page.goto(`/dashboard/bookings/${bookingId}`);
  expect(response?.status()).toBe(404);
  await expect(page.getByText(ticket.bookingCode)).toHaveCount(0);
  expect(await revealsOf(officer.id, bookingId)).toBe(0);
});
