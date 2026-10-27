import { expect, test } from '@playwright/test';

import {
  createSessions,
  PAX,
  phoneOf,
  reservedOn,
  RUN,
  STEP,
  type TestSessions,
} from './helpers/booking-wizard';
import { guestLink, holdThroughWizard, hubStateOf, tokenVersionOf } from './helpers/guest-hub';
import { runSql } from '../../scripts/local-stack';

// Task P3.12.04 (docs/Security.md GUEST-01, GUEST-02, GUEST-06): what a guest link opens on the status hub. A forged,
// expired or revoked link answers the 404 of an unknown code; a view link reads and cannot cancel; the token leaves
// the address once it is a cookie; the manage link cancels an unpaid hold and gives its seats back.

test.describe.configure({ timeout: 180_000 });

const LINKS_FLOW = 1;
const CANCEL_FLOW = 2;
const CERTIFICATE_FLOW = 3;
const ONE_HOUR_AGO = -3600;
let sessions: TestSessions;
let projectIndex = 6;

test.beforeAll(async ({}, testInfo) => {
  await runSql(`delete from public.rate_limit_buckets
    where key like 'booking:%' or key like 'otp_%' or key like 'quote_preview:%' or key like 'session_availability:%'
       or key like 'link_verify:%' or key like 'link_revoke:%' or key like 'booking_cancel:%'`);
  projectIndex = testInfo.project.name === 'desktop' ? 6 : 7;
  sessions = await createSessions(
    projectIndex,
    `Uji tautan e2e ${testInfo.project.name} ${RUN}`,
    testInfo.workerIndex,
  );
});

test('opens the hub only with a genuine, current link of its own scope', async ({
  page,
  browser,
}) => {
  const bookingCode = await holdThroughWizard(page, sessions, phoneOf(projectIndex, LINKS_FLOW));
  const version = await tokenVersionOf(bookingCode);
  const stranger = await browser.newContext();
  const visitor = await stranger.newPage();

  // The signature's first character: its last one partly encodes padding bits, which a change may leave the same.
  const genuine = guestLink(bookingCode, 'view', version);
  const signatureAt = genuine.lastIndexOf('.') + 1;
  const flipped = genuine.charAt(signatureAt) === 'A' ? 'B' : 'A';
  const tampered = genuine.slice(0, signatureAt) + flipped + genuine.slice(signatureAt + 1);
  expect((await visitor.goto(tampered))?.status()).toBe(404);
  const expired = guestLink(bookingCode, 'view', version, ONE_HOUR_AGO);
  expect((await visitor.goto(expired))?.status()).toBe(404);

  const response = await visitor.goto(guestLink(bookingCode, 'view', version));
  expect(response?.status()).toBe(200);
  expect(new URL(visitor.url()).searchParams.has('t')).toBe(false);
  expect(response?.headers()['x-robots-tag']).toContain('noindex');
  await expect(visitor.getByRole('heading', { name: 'Perjalanan reservasi' })).toBeVisible(STEP);
  await expect(visitor.getByRole('button', { name: 'Batalkan reservasi' })).toHaveCount(0);
  await expect(visitor.getByRole('button', { name: 'Cabut semua tautan' })).toHaveCount(0);

  // The manage link in the first browser revokes every link, the view link of the other browser included.
  await page.goto(`/reservasi/${bookingCode}`);
  await page.getByRole('button', { name: 'Cabut semua tautan' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Ya, cabut' }).click();
  await expect(page).toHaveURL(/\/reservasi\/cari$/, STEP);
  expect((await visitor.reload())?.status()).toBe(404);
  expect((await visitor.goto(guestLink(bookingCode, 'manage', version)))?.status()).toBe(404);
  await stranger.close();
});

test('cancels an unpaid hold from the manage link and frees its seats', async ({ page }) => {
  const bookingCode = await holdThroughWizard(page, sessions, phoneOf(projectIndex, CANCEL_FLOW));
  // The first test's hold may still hold its seats on the same session.
  const heldWithThis = await reservedOn(sessions.booked.id);
  expect(heldWithThis).toBeGreaterThanOrEqual(PAX);
  await page.goto(`/reservasi/${bookingCode}`);
  await page.getByRole('button', { name: 'Batalkan reservasi' }).click();
  const dialog = page.getByRole('alertdialog');
  await expect(dialog.getByText(/tautan pembayaran tidak berlaku lagi/)).toBeVisible();
  await dialog.getByRole('button', { name: 'Ya, batalkan' }).click();
  await expect(page.getByRole('heading', { name: 'Reservasi ini dibatalkan' })).toBeVisible(STEP);
  expect(await hubStateOf(bookingCode)).toMatchObject({ status: 'cancelled', refund_status: null });
  expect(await reservedOn(sessions.booked.id)).toBe(heldWithThis - PAX);
});

// Task P4.5.03 (docs/Security.md GUEST-02, DOC-02): the certificate page opens for its own link alone, never for the
// booking's other links, and before the visit it says when the certificates come.
test('opens the certificate page with the certificate link only', async ({ page, browser }) => {
  const bookingCode = await holdThroughWizard(
    page,
    sessions,
    phoneOf(projectIndex, CERTIFICATE_FLOW),
  );
  const version = await tokenVersionOf(bookingCode);
  const stranger = await browser.newContext();
  const visitor = await stranger.newPage();
  expect((await visitor.goto(`/reservasi/${bookingCode}/sertifikat`))?.status()).toBe(404);
  // The manage link this browser holds opens the hub, not the certificates.
  expect((await page.goto(`/reservasi/${bookingCode}/sertifikat`))?.status()).toBe(404);

  const response = await visitor.goto(guestLink(bookingCode, 'certificate', version));
  expect(response?.status()).toBe(200);
  expect(new URL(visitor.url()).searchParams.has('t')).toBe(false);
  expect(response?.headers()['x-robots-tag']).toContain('noindex');
  await expect(visitor.getByRole('heading', { name: 'Sertifikat kunjungan' })).toBeVisible(STEP);
  await expect(
    visitor.getByText(/Sertifikat terbit setelah rombongan selesai check-in/),
  ).toBeVisible();
  await expect(visitor.getByRole('link', { name: /Unduh sertifikat/ })).toHaveCount(0);
  await stranger.close();
});
