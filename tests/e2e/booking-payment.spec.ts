import { expect, test } from '@playwright/test';
import { z } from 'zod';

import {
  chooseSchedule,
  createSessions,
  expectNoSideScroll,
  fillBooker,
  phoneOf,
  readySummary,
  RUN,
  STEP,
  type TestSessions,
} from './helpers/booking-wizard';
import { E2E_MIDTRANS_STUB_URL, settleThroughWebhook } from './helpers/midtrans';
import { runSql, sqlText } from '../../scripts/local-stack';

// Task P3.7.04, P3.8.03, P3.10.02 and P3.10.03 (docs/PRD.md FR-BOOK-10, FR-BOOK-12, FR-BOOK-13): a hold from the wizard, its
// /bayar page, Snap's page from the Midtrans stand-in, a signed settlement through the webhook, the booking paid and its
// ticket's QR. A paid booking keeps its payment rows for good (payments are never deleted), so each run books sessions
// of its own label and leaves them.

test.describe.configure({ timeout: 180_000 });

const PAYMENT_FLOW = 9;
let sessions: TestSessions;

const paidRowSchema = z.array(
  z.object({
    status: z.string(),
    invoice_number: z.string().nullable(),
    ticket_messages: z.number(),
  }),
);

test.beforeAll(async ({}, testInfo) => {
  await runSql(`delete from public.rate_limit_buckets
    where key like 'booking:%' or key like 'otp_%' or key like 'quote_preview:%' or key like 'session_availability:%'
       or key like 'payment_start:%' or key like 'webhook_%' or key like 'qr_landing:%'`);
  const projectIndex = testInfo.project.name === 'desktop' ? 2 : 3;
  sessions = await createSessions(projectIndex, `Uji bayar e2e ${testInfo.project.name} ${RUN}`);
});

async function orderOf(bookingCode: string): Promise<string> {
  const rows = z.array(z.object({ order_id: z.string() })).parse(
    await runSql(`select p.order_id from public.payments p join public.bookings b on b.id = p.booking_id
        where b.booking_code = ${sqlText(bookingCode)} order by p.attempt_no desc limit 1`),
  );
  return rows[0]?.order_id ?? '';
}

test('pays a hold through Snap and the webhook, and the pay page says so', async ({
  page,
}, testInfo) => {
  const isDesktop = testInfo.project.name === 'desktop';
  await chooseSchedule(page, sessions, sessions.booked.time, isDesktop);
  await fillBooker(page, phoneOf(isDesktop ? 2 : 3, PAYMENT_FLOW));
  await page.getByRole('button', { name: 'Lanjut' }).click();
  await readySummary(page);
  await page.getByRole('button', { name: 'Konfirmasi & Bayar' }).click();

  await expect(page).toHaveURL(/\/reservasi\/GSK-[0-9A-HJKMNP-TV-Z]{8}\/bayar$/, STEP);
  const bookingCode =
    /\/reservasi\/(GSK-[0-9A-HJKMNP-TV-Z]{8})\/bayar$/.exec(page.url())?.[1] ?? '';
  await expect(page.getByRole('heading', { name: 'Pembayaran' })).toBeVisible(STEP);
  await expect(page.getByText('Sisa waktu pembayaran', { exact: true })).toBeVisible();
  if (!isDesktop) await expectNoSideScroll(page);
  // The PR's screenshots at 1280 and 360 px, kept by the CI job as an artifact (synthetic booking, no contact shown).
  await page.screenshot({
    path: testInfo.outputPath(`bayar-${testInfo.project.name}.png`),
    fullPage: true,
  });

  await page.getByRole('button', { name: 'Bayar sekarang' }).click();
  await page.waitForURL(/\/snap\/v4\/redirection\//, STEP);
  test.skip(
    !page.url().startsWith(E2E_MIDTRANS_STUB_URL),
    'this server talks to Midtrans itself, not to the stand-in (MIDTRANS_LOCAL_STUB_URL)',
  );

  const settled = await settleThroughWebhook(await orderOf(bookingCode));
  expect(settled.status).toBe(200);
  expect(await settled.json()).toEqual({ status: 'applied' });
  const [paid] = paidRowSchema.parse(
    await runSql(`select b.status::text as status,
        (select i.invoice_number from public.invoices i where i.booking_id = b.id) as invoice_number,
        (select count(*)::int from public.notifications n
         where n.booking_id = b.id and n.template = 'payment_received_ticket') as ticket_messages
      from public.bookings b where b.booking_code = ${sqlText(bookingCode)}`),
  );
  expect(paid).toMatchObject({ status: 'paid', ticket_messages: 2 });
  expect(paid?.invoice_number).toMatch(/^INV\/GSK\//);

  await page.goto(`/reservasi/${bookingCode}/bayar`);
  await expect(page.getByText('Pembayaran sudah kami terima.', { exact: false })).toBeVisible(STEP);
  await expect(page.getByRole('button', { name: 'Bayar sekarang' })).toHaveCount(0);
  await page.screenshot({
    path: testInfo.outputPath(`bayar-paid-${testInfo.project.name}.png`),
    fullPage: true,
  });

  // Task P3.10.02: the settlement issued the leg's ticket, and its page draws the QR beside the ticket code.
  await page.getByRole('link', { name: 'Lihat tiket' }).click();
  await expect(page).toHaveURL(new RegExp(`/reservasi/${bookingCode}/tiket$`), STEP);
  await expect(page.getByRole('img', { name: /^Kode QR tiket RW 05/ })).toBeVisible(STEP);
  await expect(page.getByText(`${bookingCode}-05`, { exact: true })).toBeVisible();
  if (!isDesktop) await expectNoSideScroll(page);
  await page.screenshot({
    path: testInfo.outputPath(`tiket-${testInfo.project.name}.png`),
    fullPage: true,
  });
});

test('says a forged ticket is not valid, and nothing more', async ({ page }) => {
  // Task P3.10.03: a token of the right shape whose signature no key made.
  await page.goto(`/v/GSK.k1.${'A'.repeat(22)}.${'B'.repeat(22)}`);
  await expect(page.getByText('Tiket tidak valid', { exact: true })).toBeVisible(STEP);
  await expect(page.getByText('Tiket valid', { exact: true })).toHaveCount(0);
});
