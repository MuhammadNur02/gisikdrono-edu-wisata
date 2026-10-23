import { randomInt, randomUUID } from 'node:crypto';

import { expect, type Page } from '@playwright/test';
import { z } from 'zod';

import { hasHorizontalScroll, waitForTurnstile } from './staff';
import { runSql, sqlText } from '../../../scripts/local-stack';

// What the booking wizard specs share (Task P3.5.05, P3.6.06): sessions of their own on the seeded RW 05 package, the
// WhatsApp code read from its outbox row, and one step of the wizard per helper. The code is read while
// requestPhoneOtpAction waits out its 1.2 s (review of PR #20, L4), since the worker erases it once it sends or gives
// up, and the numbers come from 0850, a range no Indonesian operator serves.
export const PACKAGE_SLUG = 'paket-eduwisata-ecowastreme';
export const PAX = 3;
export const RUN = String(randomInt(1000, 9999));
const OTP_POLL_MS = 100;
const OTP_WAIT_MS = 10_000;
export const STEP = { timeout: 30_000 };

export interface TestSessions {
  // Each project's sessions carry its own label, so a cleanup never touches the other project's rows.
  label: string;
  visitDate: string;
  booked: { id: string; time: string };
  filled: { id: string; time: string };
}

// The desktop and phone projects may run side by side, each at its own hour of a day three days ahead.
export async function createSessions(projectIndex: number, label: string): Promise<TestSessions> {
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
export async function removeSessions(label: string): Promise<void> {
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

export function phoneOf(projectIndex: number, flow: number): string {
  return `+62850${RUN}${String(projectIndex)}${String(flow).padStart(2, '0')}`;
}

// While requestPhoneOtpAction waits out its 1.2 s, the code is in its outbox row.
export async function waitForOtpCode(phone: string): Promise<string> {
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
export async function forgetOtpMessages(phone: string): Promise<void> {
  await runSql(`select set_config('app.purge', 'on', true);
    delete from public.notifications where template = 'phone_otp' and recipient = ${sqlText(phone)}`);
}

export async function expectNoSideScroll(page: Page) {
  expect(await hasHorizontalScroll(page)).toBe(false);
}

export async function pickDate(page: Page, visitDate: string, isDesktop: boolean) {
  if (isDesktop) await page.getByRole('button', { name: /Tanggal kunjungan/ }).click();
  const day = page.locator(`[data-day="${visitDate}"]:not([data-outside]) button`);
  for (let month = 0; month < 3 && !(await day.isVisible()); month += 1) {
    await page.locator('.rdp-button_next').click();
  }
  await day.click();
}

export async function chooseSchedule(
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

export async function proveWhatsApp(page: Page, phone: string) {
  await page.getByLabel('Nomor WhatsApp penanggung jawab').fill(`0${phone.slice(3)}`);
  await waitForTurnstile(page);
  const code = waitForOtpCode(phone);
  await page.getByRole('button', { name: 'Kirim kode' }).click();
  await page.getByLabel('Kode verifikasi').fill(await code);
  await page.getByRole('button', { name: 'Verifikasi' }).click();
  await expect(page.getByText('Nomor WhatsApp sudah terverifikasi.')).toBeVisible(STEP);
}

export async function fillBooker(page: Page, phone: string) {
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

export async function addOneAddon(page: Page) {
  await expect(page.getByRole('heading', { name: 'Pesanan tambahan (tidak wajib)' })).toBeVisible(
    STEP,
  );
  await page.getByRole('button', { name: 'Tambah' }).first().click();
  await expect(page.getByText('Total', { exact: true })).toBeVisible(STEP);
  await page.getByRole('button', { name: 'Lanjut' }).click();
}

export async function readySummary(page: Page) {
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

export async function bookingOf(phone: string) {
  return bookingRowSchema.parse(
    await runSql(`select booking_code, status, phone_verified_at is not null as phone_verified, consent_version
      from public.bookings where pic_phone = ${sqlText(phone)}`),
  );
}
