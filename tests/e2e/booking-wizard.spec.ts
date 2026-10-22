import { randomInt, randomUUID } from 'node:crypto';

import { expect, test, type Page } from '@playwright/test';
import { z } from 'zod';

import { hasHorizontalScroll, waitForTurnstile } from './helpers/staff';
import { runSql, sqlText } from '../../scripts/local-stack';

// Task P3.5.05 (docs/PRD.md FR-BOOK-01…06, NFR-04): the booking wizard on the local stack, from the first step to
// the hold. Each project books sessions of its own, at start times nobody else uses, on the seeded RW 05 package.
// The WhatsApp code is read from its outbox row (template phone_otp): the request answers no sooner than 1.2 s (review
// of PR #20, L4) and the row holds the code until the worker sends or gives it up, so it is read while the request
// is still waiting. The numbers come from 0850, a range no Indonesian operator serves, so a code never reaches a
// person whatever WhatsApp account the server holds.

test.describe.configure({ timeout: 180_000 });

const PACKAGE_SLUG = 'paket-eduwisata-ecowastreme';
const PAX = 3;
const RUN = String(randomInt(1000, 9999));
const OTP_POLL_MS = 100;
const OTP_WAIT_MS = 10_000;
const STEP = { timeout: 30_000 };

interface TestSessions {
  // Each project's sessions carry its own label, so a cleanup never touches the other project's rows.
  label: string;
  visitDate: string;
  booked: { id: string; time: string };
  filled: { id: string; time: string };
}

// The desktop and phone projects may run side by side, each at its own hour of a day three days ahead.
async function createSessions(projectIndex: number, label: string): Promise<TestSessions> {
  const hour = String(5 + projectIndex).padStart(2, '0');
  const ids = [randomUUID(), randomUUID()];
  const rows = z.array(z.object({ visit_date: z.string() })).parse(
    await runSql(`insert into public.visit_sessions (id, rw_id, session_date, start_time, end_time, label, capacity)
      values ('${ids[0] ?? ''}', 5, public.today_jkt() + 3, '${hour}:05', '${hour}:30', ${sqlText(label)}, 40),
             ('${ids[1] ?? ''}', 5, public.today_jkt() + 3, '${hour}:35', '${hour}:55', ${sqlText(label)}, 40)
      returning session_date::text as visit_date`),
  );
  return {
    label,
    visitDate: rows[0]?.visit_date ?? '',
    booked: { id: ids[0] ?? '', time: `${hour}.05–${hour}.30 WIB` },
    filled: { id: ids[1] ?? '', time: `${hour}.35–${hour}.55 WIB` },
  };
}

// Whatever the project's sessions hold, from this run or one that stopped halfway. One query string is one
// transaction, so the purge and fence switches end with it.
async function removeSessions(label: string): Promise<void> {
  const sessionIds = `select id from public.visit_sessions where label = ${sqlText(label)}`;
  const bookings = `select booking_id from public.booking_legs where visit_session_id in (${sessionIds})`;
  await runSql(`select set_config('app.purge', 'on', true), set_config('app.in_rpc', '1', true);
    create temporary table gone on commit drop as ${bookings};
    create temporary table gone_phones on commit drop as
      select pic_phone from public.bookings where id in (select booking_id from gone);
    delete from public.notifications where booking_id in (select booking_id from gone);
    delete from public.booking_events where booking_id in (select booking_id from gone);
    delete from public.booking_addons where booking_id in (select booking_id from gone);
    delete from public.booking_participants where booking_id in (select booking_id from gone);
    delete from public.booking_legs where booking_id in (select booking_id from gone);
    delete from public.guest_otps where booking_id in (select booking_id from gone);
    delete from public.bookings where id in (select booking_id from gone);
    delete from public.notifications where template = 'phone_otp' and recipient like '+62850%';
    delete from public.guest_otps where phone like '+62850%' and booking_id is null;
    update public.visit_sessions set reserved_pax = 0 where id in (${sessionIds});
    delete from public.visit_sessions where label = ${sqlText(label)};`);
}

function phoneOf(projectIndex: number, flow: number): string {
  return `+62850${RUN}${String(projectIndex)}${String(flow).padStart(2, '0')}`;
}

// While requestPhoneOtpAction waits out its 1.2 s, the code is in its outbox row.
async function waitForOtpCode(phone: string): Promise<string> {
  const deadline = Date.now() + OTP_WAIT_MS;
  while (Date.now() < deadline) {
    const rows = z.array(z.object({ code: z.string() })).parse(
      await runSql(`select params ->> 'code' as code from public.notifications
        where template = 'phone_otp' and recipient = ${sqlText(phone)} and params ? 'code'
        order by created_at desc limit 1`),
    );
    if (rows[0]) return rows[0].code;
    await new Promise((resolve) => setTimeout(resolve, OTP_POLL_MS));
  }
  throw new Error(`no WhatsApp code was queued for ${phone}`);
}

// The worker may still be retrying an earlier code's message, whose row keeps that code, so a second code for the
// same number is read only after the earlier messages are gone.
async function forgetOtpMessages(phone: string): Promise<void> {
  await runSql(`select set_config('app.purge', 'on', true);
    delete from public.notifications where template = 'phone_otp' and recipient = ${sqlText(phone)}`);
}

async function expectNoSideScroll(page: Page) {
  expect(await hasHorizontalScroll(page)).toBe(false);
}

async function pickDate(page: Page, visitDate: string, isDesktop: boolean) {
  if (isDesktop) await page.getByRole('button', { name: /Tanggal kunjungan/ }).click();
  const day = page.locator(`[data-day="${visitDate}"]:not([data-outside]) button`);
  for (let month = 0; month < 3 && !(await day.isVisible()); month += 1) {
    await page.locator('.rdp-button_next').click();
  }
  await day.click();
}

async function chooseSchedule(
  page: Page,
  sessions: TestSessions,
  time: string,
  isDesktop: boolean,
) {
  await page.goto(`/pesan/${PACKAGE_SLUG}?step=jadwal`);
  await expect(page.getByRole('heading', { name: 'Pilih tanggal dan sesi' })).toBeVisible(STEP);
  await page.getByRole('spinbutton').fill(String(PAX));
  await pickDate(page, sessions.visitDate, isDesktop);
  await page.getByText(time).click();
  await page.getByRole('button', { name: 'Lanjut' }).click();
}

async function proveWhatsApp(page: Page, phone: string) {
  await page.getByLabel('Nomor WhatsApp penanggung jawab').fill(`0${phone.slice(3)}`);
  await waitForTurnstile(page);
  const code = waitForOtpCode(phone);
  await page.getByRole('button', { name: 'Kirim kode' }).click();
  await page.getByLabel('Kode verifikasi').fill(await code);
  await page.getByRole('button', { name: 'Verifikasi' }).click();
  await expect(page.getByText('Nomor WhatsApp sudah terverifikasi.')).toBeVisible(STEP);
}

async function fillBooker(page: Page, phone: string) {
  await expect(page.getByRole('heading', { name: 'Data penanggung jawab rombongan' })).toBeVisible(
    STEP,
  );
  await page.getByRole('combobox', { name: /Jenis rombongan/ }).click();
  await page.getByRole('option', { name: 'Pribadi atau keluarga' }).click();
  await page.getByLabel(/Nama penanggung jawab/).fill('Tamu Uji E2E');
  await page.getByLabel(/Email penanggung jawab/).fill(`e2e${RUN}@contoh.test`);
  await proveWhatsApp(page, phone);
  await page.getByRole('button', { name: 'Lanjut' }).click();
}

async function addOneAddon(page: Page) {
  await expect(page.getByRole('heading', { name: 'Pesanan tambahan (tidak wajib)' })).toBeVisible(
    STEP,
  );
  await page.getByRole('button', { name: 'Tambah' }).first().click();
  await expect(page.getByText('Total', { exact: true })).toBeVisible(STEP);
  await page.getByRole('button', { name: 'Lanjut' }).click();
}

async function readySummary(page: Page) {
  await expect(page.getByRole('heading', { name: 'Ringkasan pesanan' })).toBeVisible(STEP);
  await expect(page.getByText('Total', { exact: true })).toBeVisible(STEP);
  await page.getByRole('checkbox', { name: /Saya telah membaca/ }).check();
  await waitForTurnstile(page);
}

const bookingRowSchema = z.array(
  z.object({
    booking_code: z.string(),
    status: z.string(),
    phone_verified: z.boolean(),
    consent_version: z.string(),
  }),
);

async function bookingOf(phone: string) {
  return bookingRowSchema.parse(
    await runSql(`select booking_code, status, phone_verified_at is not null as phone_verified, consent_version
      from public.bookings where pic_phone = ${sqlText(phone)}`),
  );
}

let sessions: TestSessions;

test.beforeAll(async ({}, testInfo) => {
  await runSql(`delete from public.rate_limit_buckets
    where key like 'booking:%' or key like 'otp_%' or key like 'quote_preview:%' or key like 'session_availability:%'`);
  const label = `Uji e2e ${testInfo.project.name}`;
  await removeSessions(label);
  sessions = await createSessions(testInfo.project.name === 'desktop' ? 0 : 1, label);
});

test.afterAll(async () => {
  await removeSessions(sessions.label);
});

test('books a hold through all four steps and lands on its pay page with its manage link', async ({
  page,
  context,
}, testInfo) => {
  const isDesktop = testInfo.project.name === 'desktop';
  const phone = phoneOf(isDesktop ? 0 : 1, 1);
  await chooseSchedule(page, sessions, sessions.booked.time, isDesktop);
  await fillBooker(page, phone);
  if (!isDesktop) await expectNoSideScroll(page);
  await addOneAddon(page);
  await readySummary(page);
  if (!isDesktop) await expectNoSideScroll(page);
  await page.getByRole('button', { name: 'Konfirmasi & Bayar' }).click();

  await expect(page).toHaveURL(/\/reservasi\/GSK-[0-9A-HJKMNP-TV-Z]{8}\/bayar$/, STEP);
  const [booking] = await bookingOf(phone);
  expect(booking).toMatchObject({
    status: 'pending_payment',
    phone_verified: true,
    consent_version: '2026-10-18',
  });
  const code = booking?.booking_code ?? '';
  expect(page.url()).toContain(`/reservasi/${code}/bayar`);
  const linkCookie = (await context.cookies()).find((cookie) => cookie.name === `bk_${code}`);
  expect(linkCookie).toMatchObject({ httpOnly: true, path: `/reservasi/${code}` });
});

test('tells a session that filled meanwhile as full, and offers another', async ({
  page,
}, testInfo) => {
  const isDesktop = testInfo.project.name === 'desktop';
  const phone = phoneOf(isDesktop ? 0 : 1, 2);
  await chooseSchedule(page, sessions, sessions.filled.time, isDesktop);
  await fillBooker(page, phone);
  await page.getByRole('button', { name: 'Lanjut' }).click();
  await readySummary(page);
  await runSql(`select set_config('app.in_rpc', '1', true);
    update public.visit_sessions set reserved_pax = capacity where id = '${sessions.filled.id}'`);
  await page.getByRole('button', { name: 'Konfirmasi & Bayar' }).click();

  await expect(page.getByText('Kuota sesi ini sudah penuh, coba pilih jam lain ya.')).toBeVisible(
    STEP,
  );
  expect(await bookingOf(phone)).toEqual([]);
  await page.getByRole('button', { name: 'Pilih sesi lain' }).click();
  await expect(page).toHaveURL(/step=jadwal$/);
});

// Review of PR #27, L5: a visitor who already holds this session unpaid hears that its link went out again, and the
// draft goes, as it does after a booking. The second try comes from a fresh browser, as a visitor's laptop after
// their phone would.
test('sends the link of a hold the visitor already has again, and lets the draft go', async ({
  page,
  context,
}, testInfo) => {
  const isDesktop = testInfo.project.name === 'desktop';
  const phone = phoneOf(isDesktop ? 0 : 1, 4);
  for (const attempt of ['hold', 'again']) {
    await context.clearCookies();
    await forgetOtpMessages(phone);
    await chooseSchedule(page, sessions, sessions.booked.time, isDesktop);
    await fillBooker(page, phone);
    await page.getByRole('button', { name: 'Lanjut' }).click();
    await readySummary(page);
    await page.getByRole('button', { name: 'Konfirmasi & Bayar' }).click();
    if (attempt === 'hold') await expect(page).toHaveURL(/\/bayar$/, STEP);
  }

  await expect(page.getByText('Pesanan Anda sudah ada')).toBeVisible(STEP);
  const draft = await page.evaluate(
    (key) => window.sessionStorage.getItem(key),
    `gsk-booking-draft:${PACKAGE_SLUG}`,
  );
  expect(draft).toBeNull();
  expect(await bookingOf(phone)).toHaveLength(1);
});

// docs/StyleGuide.md A13: every control of the wizard works without a pointer. Focus is moved to a control and the
// keyboard does the rest: Enter sends a step, Space ticks and chooses, the arrows move through a list.
test('can be completed with the keyboard alone', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'one keyboard run is enough');
  const phone = phoneOf(0, 3);
  await page.goto(`/pesan/${PACKAGE_SLUG}?step=jadwal`);
  await page.getByRole('spinbutton').focus();
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.type(String(PAX));
  await page.getByRole('button', { name: /Tanggal kunjungan/ }).focus();
  await page.keyboard.press('Enter');
  const day = page.locator(`[data-day="${sessions.visitDate}"]:not([data-outside]) button`);
  for (let month = 0; month < 3 && !(await day.isVisible()); month += 1) {
    await page.locator('.rdp-button_next').focus();
    await page.keyboard.press('Enter');
  }
  await day.focus();
  await page.keyboard.press('Enter');
  await page.getByRole('radio', { name: new RegExp(sessions.booked.time) }).focus();
  await page.keyboard.press('Space');
  // A radio takes no Enter (the WAI-ARIA radio pattern); the step is sent from its button.
  await page.getByRole('button', { name: 'Lanjut' }).focus();
  await page.keyboard.press('Enter');

  await expect(page.getByRole('heading', { name: 'Data penanggung jawab rombongan' })).toBeVisible(
    STEP,
  );
  await page.getByRole('combobox', { name: /Jenis rombongan/ }).focus();
  await page.keyboard.press('Enter');
  await page.getByRole('option', { name: 'Pribadi atau keluarga' }).focus();
  await page.keyboard.press('Enter');
  // The select gives the focus back to its trigger once it has closed; a key typed before that would choose again.
  await expect(page.getByRole('listbox')).toBeHidden();
  await expect(page.getByRole('combobox', { name: /Jenis rombongan/ })).toBeFocused();
  await page.getByLabel(/Nama penanggung jawab/).focus();
  await page.keyboard.type('Tamu Papan Ketik');
  await page.getByLabel(/Email penanggung jawab/).focus();
  await page.keyboard.type(`ketik${RUN}@contoh.test`);
  const phoneField = page.getByLabel('Nomor WhatsApp penanggung jawab');
  await phoneField.focus();
  await page.keyboard.type(`0${phone.slice(3)}`);
  await waitForTurnstile(page);
  const code = waitForOtpCode(phone);
  // Enter in the number asks for the code and in the code checks it; neither sends the step (review of PR #27, L6).
  await phoneField.focus();
  await page.keyboard.press('Enter');
  await page.getByLabel('Kode verifikasi').focus();
  await page.keyboard.type(await code);
  await page.keyboard.press('Enter');
  await expect(page.getByText('Nomor WhatsApp sudah terverifikasi.')).toBeVisible(STEP);
  await expect(
    page.getByRole('heading', { name: 'Data penanggung jawab rombongan' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Lanjut' }).focus();
  await page.keyboard.press('Enter');

  await expect(page.getByRole('heading', { name: 'Pesanan tambahan (tidak wajib)' })).toBeVisible(
    STEP,
  );
  await page.getByRole('button', { name: 'Lanjut' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Ringkasan pesanan' })).toBeVisible(STEP);
  await expect(page.getByText('Total', { exact: true })).toBeVisible(STEP);
  await page.getByRole('checkbox', { name: /Saya telah membaca/ }).focus();
  await page.keyboard.press('Space');
  await waitForTurnstile(page);
  await page.getByRole('button', { name: 'Konfirmasi & Bayar' }).focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/reservasi\/GSK-[0-9A-HJKMNP-TV-Z]{8}\/bayar$/, STEP);
});
