import { expect, test } from '@playwright/test';
import { z } from 'zod';

import {
  addOneAddon,
  bookingOf,
  chooseSchedule,
  createSessions,
  expectNoSideScroll,
  fillBooker,
  forgetOtpMessages,
  PACKAGE_SLUG,
  PAX,
  phoneOf,
  proveWhatsApp,
  readySummary,
  removeSessions,
  reservedOn,
  RUN,
  STEP,
  waitForOtpCode,
  type TestSessions,
} from './helpers/booking-wizard';
import { waitForTurnstile } from './helpers/staff';
import { runSql, sqlText } from '../../scripts/local-stack';

// Task P3.5.05 (docs/PRD.md FR-BOOK-01…06, NFR-04) and P3.6.06: the booking wizard on the local stack, from the first
// step to the hold or the quotation. Each project books sessions of its own (tests/e2e/helpers/booking-wizard.ts).

test.describe.configure({ timeout: 180_000 });

let sessions: TestSessions;
let projectIndex = 0;

test.beforeAll(async ({}, testInfo) => {
  await runSql(`delete from public.rate_limit_buckets
    where key like 'booking:%' or key like 'otp_%' or key like 'quote_preview:%' or key like 'session_availability:%'`);
  const label = `Uji e2e ${testInfo.project.name}`;
  projectIndex = testInfo.project.name === 'desktop' ? 0 : 1;
  await removeSessions(label, projectIndex);
  sessions = await createSessions(projectIndex, label);
});

test.afterAll(async () => {
  await removeSessions(sessions.label, projectIndex);
});

test('books a hold through all four steps and lands on its pay page with its manage link', async ({
  page,
  context,
}, testInfo) => {
  const isDesktop = testInfo.project.name === 'desktop';
  const phone = phoneOf(isDesktop ? 0 : 1, 1);
  await chooseSchedule(page, sessions, sessions.booked.time);
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
  await chooseSchedule(page, sessions, sessions.filled.time);
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
    await chooseSchedule(page, sessions, sessions.booked.time);
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

// Task P3.6.06 (docs/PRD.md FR-B2B-01, BOOK-08): a school's "Minta Surat Penawaran" makes a quoted booking with its
// numbered Surat Penawaran, holds no seat, and queues the quotation message on both channels. The status page it
// lands on arrives with P3.12.01, so only its address is checked here.
test('issues a quotation for a school without holding a seat', async ({ page }, testInfo) => {
  const isDesktop = testInfo.project.name === 'desktop';
  const phone = phoneOf(isDesktop ? 0 : 1, 5);
  await chooseSchedule(page, sessions, sessions.booked.time);
  await expect(page.getByRole('heading', { name: 'Data penanggung jawab rombongan' })).toBeVisible(
    STEP,
  );
  await page.getByRole('combobox', { name: /Jenis rombongan/ }).click();
  await page.getByRole('option', { name: 'Sekolah' }).click();
  await page.getByLabel(/Nama sekolah, kampus/).fill('SD Negeri Uji E2E');
  await page.getByLabel(/Nama penanggung jawab/).fill('Ani Uji E2E');
  await page.getByLabel(/Email penanggung jawab/).fill(`sekolah${RUN}@contoh.test`);
  await proveWhatsApp(page, phone);
  await page.getByRole('button', { name: 'Lanjut' }).click();
  await page.getByRole('button', { name: 'Lanjut' }).click();
  await readySummary(page);
  // The other tests of this project hold seats on the same session, so the check is that this one adds none.
  const seatsBefore = await reservedOn(sessions.booked.id);
  await page.getByRole('button', { name: 'Minta Surat Penawaran' }).click();

  await expect(page).toHaveURL(/\/reservasi\/GSK-[0-9A-HJKMNP-TV-Z]{8}$/, STEP);
  const [booking] = await bookingOf(phone);
  expect(booking).toMatchObject({ status: 'quoted', phone_verified: true });
  const rows = z
    .array(z.object({ quotations: z.coerce.number(), messages: z.coerce.number() }))
    .parse(
      await runSql(`select
        (select count(*) from public.quotations q where q.booking_id = b.id and q.status = 'issued') as quotations,
        (select count(*) from public.notifications n where n.booking_id = b.id and n.template = 'quotation_ready')
          as messages
        from public.bookings b where b.pic_phone = ${sqlText(phone)}`),
    );
  expect(rows[0]).toEqual({ quotations: 1, messages: 2 });
  expect(await reservedOn(sessions.booked.id)).toBe(seatsBefore);
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
  // The calendar is inline (DESIGN-SPEC §3.10): its days are buttons the keyboard reaches directly.
  await expect(page.getByRole('group', { name: /Tanggal kunjungan.*wajib/ })).toBeVisible();
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
