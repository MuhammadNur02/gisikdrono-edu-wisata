import { expect, test, type Page } from '@playwright/test';
import { z } from 'zod';

import {
  createSessions,
  expectNoSideScroll,
  phoneOf,
  reservedOn,
  RUN,
  STEP,
  type TestSessions,
} from './helpers/booking-wizard';
import { declareWeather, holdThroughWizard, hubStateOf } from './helpers/guest-hub';
import { E2E_MIDTRANS_STUB_URL, settleThroughWebhook } from './helpers/midtrans';
import { runSql, sqlText } from '../../scripts/local-stack';

// Task P3.13.02 with P3.7.05 and P3.12.01-02 (docs/PRD.md FR-BOOK-11, FR-BOOK-23, FR-BOOK-24): a hold paid through
// Snap's stand-in and the webhook while the status hub polls, its ticket, then the hub's manage link moving the visit
// after a weather notice and cancelling it under the visit terms. A paid booking keeps its rows for good, so each run
// books sessions of its own label and leaves them.

test.describe.configure({ timeout: 240_000 });

const HUB_FLOW = 1;
// The poll is 5 s; the settlement, the ticket and the page's next read fit in three of them.
const POLL_WAIT = { timeout: 20_000 };
let sessions: TestSessions;
let projectIndex = 4;

test.beforeAll(async ({}, testInfo) => {
  await runSql(`delete from public.rate_limit_buckets
    where key like 'booking:%' or key like 'otp_%' or key like 'quote_preview:%' or key like 'session_availability:%'
       or key like 'payment_start:%' or key like 'webhook_%' or key like 'booking_cancel:%'
       or key like 'booking_reschedule:%' or key like 'link_verify:%'`);
  projectIndex = testInfo.project.name === 'desktop' ? 4 : 5;
  sessions = await createSessions(
    projectIndex,
    `Uji hub e2e ${testInfo.project.name} ${RUN}`,
    testInfo.workerIndex,
  );
});

async function orderOf(bookingCode: string): Promise<string> {
  const rows = z.array(z.object({ order_id: z.string() })).parse(
    await runSql(`select p.order_id from public.payments p join public.bookings b on b.id = p.booking_id
        where b.booking_code = ${sqlText(bookingCode)} order by p.attempt_no desc limit 1`),
  );
  return rows[0]?.order_id ?? '';
}

async function shoot(page: Page, name: string, project: string) {
  await page.screenshot({ path: test.info().outputPath(`${name}-${project}.png`), fullPage: true });
}

async function payWhileTheHubPolls(page: Page, bookingCode: string) {
  await page.getByRole('button', { name: 'Bayar sekarang' }).click();
  await page.waitForURL(/\/snap\/v4\/redirection\//, STEP);
  test.skip(
    !page.url().startsWith(E2E_MIDTRANS_STUB_URL),
    'this server talks to Midtrans itself, not to the stand-in (MIDTRANS_LOCAL_STUB_URL)',
  );
  // Snap's finish address carries its own idea of the outcome; the hub reads the database only (PAY-09).
  await page.goto(`/reservasi/${bookingCode}?order_id=x&transaction_status=settlement`);
  await expect(
    page.getByRole('heading', { name: 'Selesaikan pembayaran sebelum waktu habis' }),
  ).toBeVisible(STEP);
  await expect(page.getByText('Batas bayar', { exact: true })).toBeVisible();
  expect((await settleThroughWebhook(await orderOf(bookingCode))).status).toBe(200);
  await expect(
    page.getByRole('heading', { name: 'Pembayaran diterima. Sampai jumpa di hari kunjungan' }),
  ).toBeVisible(POLL_WAIT);
}

async function moveForWeather(page: Page, bookingCode: string) {
  await declareWeather(sessions.booked.id);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Kunjungan terhalang cuaca' })).toBeVisible(STEP);
  await page.locator(`input[name="weather-day"][value="${sessions.visitDate}"]`).check();
  await page.locator(`input[name="weather-session"][value="${sessions.filled.id}"]`).check();
  await page.getByRole('button', { name: 'Pindah ke jadwal ini' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Jadwal sudah dipindah' })).toBeVisible(
    STEP,
  );
  // Decision of 2026-10-25 on the weather, rule 1: the rights stay open after a move, one move fewer.
  await expect(page.getByText(/bisa dipindah 2 kali lagi/)).toBeVisible(STEP);
  expect((await hubStateOf(bookingCode))?.session_id).toBe(sessions.filled.id);
  expect(await reservedOn(sessions.booked.id)).toBe(0);
  expect(await reservedOn(sessions.filled.id)).toBeGreaterThan(0);
}

async function cancelUnderTheTerms(page: Page, bookingCode: string) {
  await page.getByRole('button', { name: 'Batalkan reservasi' }).click();
  const dialog = page.getByRole('alertdialog');
  await expect(dialog.getByText(/Dana yang dikembalikan: Rp/)).toBeVisible();
  // The visit is three days ahead: H-3 gives 90 % of the package back (docs/PRD.md §13.1 A16).
  await expect(dialog.getByText(/90 % paket/)).toBeVisible();
  await dialog.getByRole('button', { name: 'Ya, batalkan' }).click();
  await expect(page.getByRole('heading', { name: 'Reservasi ini dibatalkan' })).toBeVisible(STEP);
  await expect(page.getByText(/Pengembalian dana Rp.* sedang diproses/)).toBeVisible();
  const state = await hubStateOf(bookingCode);
  expect(state).toMatchObject({ status: 'cancelled', refund_status: 'requested' });
  expect(state?.ticket_statuses).toEqual(['revoked']);
  expect(state?.refund_amount).toBeGreaterThan(0);
  expect(await reservedOn(sessions.filled.id)).toBe(0);
}

test('pays from the hub, moves for the weather and cancels under the visit terms', async ({
  page,
}, testInfo) => {
  const project = testInfo.project.name;
  const bookingCode = await holdThroughWizard(page, sessions, phoneOf(projectIndex, HUB_FLOW));
  await page.goto(`/reservasi/${bookingCode}`);
  await expect(page.getByRole('heading', { name: 'Yang membayar bendahara?' })).toBeVisible(STEP);
  await expect(page.getByRole('heading', { name: 'Perjalanan reservasi' })).toBeVisible();
  if (project !== 'desktop') await expectNoSideScroll(page);
  await shoot(page, 'hub-pending', project);
  await page.goto(`/reservasi/${bookingCode}/bayar`);
  await payWhileTheHubPolls(page, bookingCode);
  await expect(page.getByRole('link', { name: 'Lihat tiket' }).first()).toBeVisible();
  await expect(page.getByText(/^INV\/GSK\//)).toBeVisible();
  await shoot(page, 'hub-paid', project);

  await page.getByRole('link', { name: 'Lihat tiket' }).first().click();
  await expect(page.getByText(`${bookingCode}-05`, { exact: true })).toBeVisible(STEP);
  await page.goto(`/reservasi/${bookingCode}`);

  await moveForWeather(page, bookingCode);
  await cancelUnderTheTerms(page, bookingCode);
  if (project !== 'desktop') await expectNoSideScroll(page);
  await shoot(page, 'hub-cancelled', project);
});
