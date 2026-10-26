import { createHmac } from 'node:crypto';

import { expect, type Page } from '@playwright/test';
import { z } from 'zod';

import {
  chooseSchedule,
  fillBooker,
  readySummary,
  STEP,
  type TestSessions,
} from './booking-wizard';
import { SUPERADMIN } from './staff';
import { runSql, sqlText } from '../../../scripts/local-stack';
import { sandboxEnv } from '../../fixtures/env';

// The status hub's e2e helpers (Task P3.12.04, P3.13.02).

const BOOKING_URL = /\/reservasi\/(GSK-[0-9A-HJKMNP-TV-Z]{8})\/bayar$/;
const LINK_LABEL = 'gsk-guest-link-v1';
const SECONDS_PER_HOUR = 3600;

// A hold from the wizard; the browser keeps its manage cookie and lands on /bayar.
export async function holdThroughWizard(
  page: Page,
  sessions: TestSessions,
  phone: string,
): Promise<string> {
  await chooseSchedule(page, sessions, sessions.booked.time);
  await fillBooker(page, phone);
  await page.getByRole('button', { name: 'Lanjut' }).click();
  await readySummary(page);
  await page.getByRole('button', { name: 'Konfirmasi & Bayar' }).click();
  await expect(page).toHaveURL(BOOKING_URL, STEP);
  return BOOKING_URL.exec(page.url())?.[1] ?? '';
}

function base64Url(bytes: Buffer): string {
  return bytes.toString('base64').replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

// The link src/lib/links/mint.ts makes, signed with the fixture key the e2e server runs with; a past `expiresIn`
// makes an expired one.
// A link opens the page of its scope: the status hub, or the certificate page for a certificate link.
export function guestLink(
  bookingCode: string,
  scope: 'view' | 'manage' | 'pay' | 'certificate',
  tokenVersion: number,
  expiresIn = SECONDS_PER_HOUR,
): string {
  const exp = Math.floor(Date.now() / 1000) + expiresIn;
  const payload = base64Url(Buffer.from(JSON.stringify({ s: scope, v: tokenVersion, exp })));
  const signature = createHmac('sha256', sandboxEnv.BOOKING_LINK_SECRET)
    .update(`${LINK_LABEL}\n${bookingCode}.${payload}`)
    .digest();
  const page =
    scope === 'certificate' ? `/reservasi/${bookingCode}/sertifikat` : `/reservasi/${bookingCode}`;
  return `${page}?t=${payload}.${base64Url(signature)}`;
}

export async function tokenVersionOf(bookingCode: string): Promise<number> {
  const rows = z
    .array(z.object({ token_version: z.number() }))
    .parse(
      await runSql(
        `select token_version from public.bookings where booking_code = ${sqlText(bookingCode)}`,
      ),
    );
  return rows[0]?.token_version ?? 0;
}

// What an RW officer's "Terhalang cuaca" does (public.declare_weather_disruption), run as the seeded superadmin at
// AAL2 with the claims GoTrue and the access-token hook would give.
export async function declareWeather(sessionId: string): Promise<void> {
  await runSql(`do $$
    declare
      user_id uuid := (select u.id from auth.users u where u.email = ${sqlText(SUPERADMIN)});
    begin
      perform set_config('request.jwt.claims', (jsonb_build_object(
          'iss', 'supabase', 'aud', 'authenticated', 'sub', user_id, 'role', 'authenticated', 'aal', 'aal2',
          'amr', jsonb_build_array(jsonb_build_object('method', 'totp',
                                                      'timestamp', extract(epoch from now())::bigint)))
        || internal.staff_token_claims(user_id))::text, true);
      perform set_config('role', 'authenticated', true);
      perform public.declare_weather_disruption('${sessionId}', 'Hujan deras (uji e2e)');
    end $$`);
}

const hubRowSchema = z.array(
  z.object({
    status: z.string(),
    session_id: z.string().nullable(),
    ticket_statuses: z.array(z.string()).nullable(),
    refund_status: z.string().nullable(),
    refund_amount: z.number().nullable(),
  }),
);

// The booking as the database has it after a hub action.
export async function hubStateOf(bookingCode: string) {
  const [row] = hubRowSchema.parse(
    await runSql(`select b.status::text as status,
        (select l.visit_session_id::text from public.booking_legs l where l.booking_id = b.id limit 1) as session_id,
        (select array_agg(t.status::text) from public.tickets_qr t where t.booking_id = b.id) as ticket_statuses,
        (select r.status::text from public.refund_requests r where r.booking_id = b.id
          order by r.requested_at desc limit 1) as refund_status,
        (select r.amount::int from public.refund_requests r where r.booking_id = b.id
          order by r.requested_at desc limit 1) as refund_amount
      from public.bookings b where b.booking_code = ${sqlText(bookingCode)}`),
  );
  return row;
}
