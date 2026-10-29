import { randomInt, randomUUID } from 'node:crypto';

import { expect, type Page } from '@playwright/test';
import { z } from 'zod';

import { whatsAppCodeSince } from './mailbox';
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
// Mailpit stamps a message by its own clock; a second of slack keeps a code sent at once inside the window.
const CLOCK_SLACK_MS = 1_000;
export const STEP = { timeout: 30_000 };

export interface TestSessions {
  // Each project's sessions carry its own label, so a cleanup never touches the other project's rows.
  label: string;
  visitDate: string;
  booked: { id: string; time: string };
  filled: { id: string; time: string };
}

// The desktop and phone projects may run side by side, each at its own hour of a day three days ahead. `slot` moves
// the start minutes, so a worker that Playwright starts again after a failure (its beforeAll runs once more) does not
// collide with the sessions its predecessor left (visit_sessions is unique on RW, date and start time).
const MAX_SLOTS = 20;

export async function createSessions(
  projectIndex: number,
  label: string,
  slot = 0,
): Promise<TestSessions> {
  const hour = String(5 + projectIndex).padStart(2, '0');
  const minute = (base: number) => String(base + (slot % MAX_SLOTS)).padStart(2, '0');
  const [bookedStart, filledStart] = [minute(5), minute(35)];
  const ids = [randomUUID(), randomUUID()];
  const rows = z.array(z.object({ visit_date: z.string() })).parse(
    await runSql(`insert into public.visit_sessions (id, rw_id, session_date, start_time, end_time, label, capacity)
      values ('${ids[0] ?? ''}', 5, public.today_jkt() + 3, '${hour}:${bookedStart}', '${hour}:30', ${sqlText(label)}, 40),
             ('${ids[1] ?? ''}', 5, public.today_jkt() + 3, '${hour}:${filledStart}', '${hour}:55', ${sqlText(label)}, 40)
      returning session_date::text as visit_date`),
  );
  return {
    label,
    visitDate: rows[0]?.visit_date ?? '',
    booked: { id: ids[0] ?? '', time: `${hour}.${bookedStart}–${hour}.30 WIB` },
    filled: { id: ids[1] ?? '', time: `${hour}.${filledStart}–${hour}.55 WIB` },
  };
}

// Every test phone of one project, from this run or an earlier one (phoneOf: RUN's four digits, the project, the flow).
// The OTP purge below is held to it: purging every '+62850%' code also took the code, or the verified proof, of a
// booking another worker was making at that moment, which then failed as "Kode ini sudah tidak berlaku" or never
// left the summary (review of PR #45).
function projectPhonePattern(projectIndex: number): string {
  return `+62850____${String(projectIndex)}__`;
}

// Whatever the project's sessions hold, from this run or one that stopped halfway. One query string is one
// transaction, so the purge and fence switches end with it.
export async function removeSessions(label: string, projectIndex: number): Promise<void> {
  const phones = sqlText(projectPhonePattern(projectIndex));
  const sessionIds = `select id from public.visit_sessions where label = ${sqlText(label)}`;
  const bookings = `select booking_id from public.booking_legs where visit_session_id in (${sessionIds})`;
  await runSql(`select set_config('app.purge', 'on', true), set_config('app.in_rpc', '1', true);
    create temporary table gone on commit drop as ${bookings};
    create temporary table gone_phones on commit drop as
      select pic_phone from public.bookings where id in (select booking_id from gone);
    delete from public.notifications where booking_id in (select booking_id from gone);
    delete from public.quotations where booking_id in (select booking_id from gone);
    delete from public.booking_events where booking_id in (select booking_id from gone);
    delete from public.booking_addons where booking_id in (select booking_id from gone);
    delete from public.booking_participants where booking_id in (select booking_id from gone);
    delete from public.booking_legs where booking_id in (select booking_id from gone);
    delete from public.guest_otps where booking_id in (select booking_id from gone);
    delete from public.bookings where id in (select booking_id from gone);
    delete from public.notifications where template = 'phone_otp' and recipient like ${phones};
    delete from public.guest_otps where phone like ${phones} and booking_id is null;
    update public.visit_sessions set reserved_pax = 0 where id in (${sessionIds});
    delete from public.visit_sessions where label = ${sqlText(label)};`);
}

export function phoneOf(projectIndex: number, flow: number): string {
  return `+62850${RUN}${String(projectIndex)}${String(flow).padStart(2, '0')}`;
}

async function queuedOtpCode(phone: string): Promise<string | null> {
  const rows = z.array(z.object({ code: z.string() })).parse(
    await runSql(`select params ->> 'code' as code from public.notifications
      where template = 'phone_otp' and recipient = ${sqlText(phone)} and params ? 'code'
      order by created_at desc limit 1`),
  );
  return rows[0]?.code ?? null;
}

// Called just before the code is asked for. The code sits in its outbox row only until the worker, which
// requestPhoneOtpAction kicks at once, sends it and empties the row's params; on a fast run that happens between two
// polls, so a code already sent is read from Mailpit, the local WhatsApp (review of PR #48).
export async function waitForOtpCode(phone: string): Promise<string> {
  const since = new Date(Date.now() - CLOCK_SLACK_MS);
  const deadline = Date.now() + OTP_WAIT_MS;
  while (Date.now() < deadline) {
    const code = (await queuedOtpCode(phone)) ?? (await whatsAppCodeSince(phone, since));
    if (code !== null) return code;
    await new Promise((resolve) => setTimeout(resolve, OTP_POLL_MS));
  }
  throw new Error(`no WhatsApp code was queued or sent for ${phone}`);
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

export async function pickDate(page: Page, visitDate: string) {
  // The calendar is inline on every screen since the redesign (DESIGN-SPEC §3.10): a group named by the field's
  // label, its "wajib" included (Task P5.6.04).
  await expect(page.getByRole('group', { name: /Tanggal kunjungan.*wajib/ })).toBeVisible();
  const day = page.locator(`[data-day="${visitDate}"]:not([data-outside]) button`);
  for (let month = 0; month < 3 && !(await day.isVisible()); month += 1) {
    await page.locator('.rdp-button_next').click();
  }
  await day.click();
}

export async function chooseSchedule(page: Page, sessions: TestSessions, time: string) {
  await page.goto(`/pesan/${PACKAGE_SLUG}?step=jadwal`);
  await expect(page.getByRole('heading', { name: 'Pilih tanggal dan sesi' })).toBeVisible(STEP);
  await page.getByRole('spinbutton').fill(String(PAX));
  await pickDate(page, sessions.visitDate);
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
  // An address of the phone's own, so the holds of every spec and project never share the per-address limit
  // (booking:email, five a day), which a reset in one spec's beforeAll cannot keep under for the others.
  await page
    .getByLabel(/Email penanggung jawab/)
    .fill(`e2e${phone.replace(/\D/g, '')}@contoh.test`);
  await proveWhatsApp(page, phone);
  await page.getByRole('button', { name: 'Lanjut' }).click();
}

export async function readySummary(page: Page) {
  await expect(page.getByRole('heading', { name: 'Ringkasan pesanan' })).toBeVisible(STEP);
  await expect(
    page.getByRole('region', { name: 'Rincian biaya' }).getByText('Total', { exact: true }),
  ).toBeVisible(STEP);
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

// The seats a session holds right now.
export async function reservedOn(sessionId: string): Promise<number> {
  const rows = z
    .array(z.object({ reserved_pax: z.number() }))
    .parse(
      await runSql(`select reserved_pax from public.visit_sessions where id = '${sessionId}'`),
    );
  return rows[0]?.reserved_pax ?? -1;
}
