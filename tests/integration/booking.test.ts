import { randomInt, randomUUID } from 'node:crypto';

import { createClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { POST as expireBookings } from '@/app/api/jobs/expire-bookings/route';
import type { Database } from '@/db/types';
import { serverEnv } from '@/lib/env';
import { mapError } from '@/lib/errors';
import { computeBookingQuote } from '@/lib/pricing/compute-booking-quote';
import { bookingQuoteHash } from '@/lib/pricing/quote-hash';
import { createBookingSchema } from '@/lib/validations/booking';
import {
  createHold,
  createQuotedBooking,
  type BookingRequest,
} from '@/server/services/booking-service';

import { lastAuditId } from './helpers/staff-session';
import { localStack, runSql, sqlText } from '../../scripts/local-stack';

// The booking engine against the real database (Task P3.4.05, P3.4.04; docs/Security.md BOOK-01, BOOK-12, BOOK-13,
// PAY-03): booking-service.ts as createBookingAction will call it, the quote hashed as the summary will hash it.
vi.mock('@/lib/supabase/admin', () => ({
  createSupabaseAdminClient: () =>
    createClient<Database>(localStack().apiUrl, localStack().serviceRoleKey, {
      auth: { persistSession: false },
    }),
}));

const PACKAGE_ID = '00000000-0000-4000-9000-0000000b0001';
const COMBO_ID = '00000000-0000-4000-9000-0000000b0002';
const RACE_SESSION = '00000000-0000-4000-9000-0000000b0101';
const SHARE_SESSION = '00000000-0000-4000-9000-0000000b0102';
const OPEN_SESSION = '00000000-0000-4000-9000-0000000b0103';
const SPARE_SESSION = '00000000-0000-4000-9000-0000000b0104';
const FULL_SESSION_13 = '00000000-0000-4000-9000-0000000b0113';
const SESSIONS = [RACE_SESSION, SHARE_SESSION, OPEN_SESSION, SPARE_SESSION, FULL_SESSION_13];
const PRICE_PER_PAX = 30000;
const COMBO_PRICE_PER_PAX = 50000;
const PARALLEL_HOLDS = 20;
const ROOM_LEFT = 10;
// A fresh range of numbers and addresses per run, so the daily caps never carry over from an earlier run.
const RUN = String(randomInt(100000, 999999));
const SLOW_MS = 120_000;

const reservedRowsSchema = z.array(z.object({ reserved_pax: z.number() }));
const statusRowsSchema = z.array(z.object({ status: z.string() }));
const countRowsSchema = z.array(z.object({ count: z.coerce.number() }));

function phoneOf(index: number): string {
  return `+62857${RUN}${String(index).padStart(2, '0')}`;
}

async function verifiedOtp(phone: string): Promise<string> {
  const otpId = randomUUID();
  await runSql(`insert into public.guest_otps (id, purpose, phone, code_hash, browser_hash, expires_at, verified_at)
    values ('${otpId}', 'booking_phone', ${sqlText(phone)}, repeat('a', 64), repeat('b', 64),
            now() + interval '5 minutes', now())`);
  return otpId;
}

function quoteHashFor(
  packageId: string,
  pricePerPax: number,
  rwIds: number[],
  pax: number,
): string {
  const quote = computeBookingQuote({
    package: {
      id: packageId,
      name: 'Paket Uji',
      pricingBasis: 'per_pax',
      pricePerPax,
      flatPrice: null,
      minPax: 1,
      maxPax: 200,
    },
    legs: rwIds.map((rwId) => ({ rwId })),
    tiers: [],
    products: [],
    pax,
    addons: [],
  });
  if (!quote.ok) throw new Error('the fixture package should price this group');
  return bookingQuoteHash(quote.quote);
}

async function requestFor(
  index: number,
  sessionIds: string[],
  options: { pax?: number; combo?: boolean } = {},
) {
  const pax = options.pax ?? 1;
  const phone = phoneOf(index);
  const values = createBookingSchema(500).parse({
    packageId: options.combo ? COMBO_ID : PACKAGE_ID,
    visitSessionIds: sessionIds,
    visitDate: '2026-11-12',
    pax,
    bookerType: 'individual',
    institutionName: null,
    picName: `Tamu Uji ${String(index)}`,
    picEmail: `tamu${RUN}${String(index)}@contoh.test`,
    notes: '',
    addons: [],
    participants: [],
    guardianConsent: false,
    consentVersion: '2026-10-18',
    privacyAccepted: true,
    idempotencyKey: randomUUID(),
    quoteHash: options.combo
      ? quoteHashFor(COMBO_ID, COMBO_PRICE_PER_PAX, [5, 13], pax)
      : quoteHashFor(PACKAGE_ID, PRICE_PER_PAX, [5], pax),
    turnstileToken: 'XXXX.DUMMY.TOKEN.XXXX',
  });
  const request: BookingRequest = {
    values,
    proof: {
      channel: 'whatsapp',
      phone,
      email: null,
      otpId: await verifiedOtp(phone),
      expiresAt: 0,
    },
    clientIp: `198.51.${String(randomInt(0, 255))}.${String(index + 1)}`,
    userAgent: 'Integration',
  };
  return request;
}

async function reservedOf(sessionId: string): Promise<number> {
  const rows = reservedRowsSchema.parse(
    await runSql(`select reserved_pax from public.visit_sessions where id = '${sessionId}'`),
  );
  return rows[0]?.reserved_pax ?? -1;
}

async function errorCodeOf(error: unknown): Promise<string> {
  return (await mapError(error)).error.code;
}

let auditIdBefore = 0;

beforeAll(async () => {
  auditIdBefore = await lastAuditId();
  await runSql(`insert into public.tour_packages (id, rw_id, category, slug, name, pricing_basis, price_per_pax, status)
      values ('${PACKAGE_ID}', 5, 'regular', 'uji-integrasi-pesan', 'Paket Uji', 'per_pax', ${String(PRICE_PER_PAX)},
              'published');
    insert into public.tour_packages (id, category, slug, name, pricing_basis, price_per_pax, status)
      values ('${COMBO_ID}', 'combo', 'uji-integrasi-kombo', 'Paket Uji', 'per_pax', ${String(COMBO_PRICE_PER_PAX)}, 'draft');
    insert into public.tour_package_legs (package_id, rw_id, leg_order)
      values ('${COMBO_ID}', 5, 1), ('${COMBO_ID}', 13, 2);
    update public.tour_packages set status = 'published' where id = '${COMBO_ID}';
    insert into public.visit_sessions (id, rw_id, session_date, start_time, end_time, label, capacity) values
      ('${RACE_SESSION}', 5, public.today_jkt() + 6, '07:05', '08:05', 'Uji balapan', 40),
      ('${SHARE_SESSION}', 5, public.today_jkt() + 6, '08:15', '09:15', 'Uji separuh', 10),
      ('${OPEN_SESSION}', 5, public.today_jkt() + 6, '09:25', '10:25', 'Uji terbuka', 40),
      ('${SPARE_SESSION}', 5, public.today_jkt() + 6, '10:35', '11:35', 'Uji cadangan', 40),
      ('${FULL_SESSION_13}', 13, public.today_jkt() + 6, '07:05', '08:05', 'Uji penuh', 10);
    select set_config('app.in_rpc', '1', true);
    update public.visit_sessions set reserved_pax = 30 where id = '${RACE_SESSION}';
    update public.visit_sessions set reserved_pax = 10 where id = '${FULL_SESSION_13}';`);
}, SLOW_MS);

// One query string is one transaction, so the purge and fence switches end with it.
afterAll(async () => {
  const bookings = `select id from public.bookings where package_id in ('${PACKAGE_ID}', '${COMBO_ID}')`;
  await runSql(`select set_config('app.purge', 'on', true), set_config('app.in_rpc', '1', true);
    delete from public.notifications where booking_id in (${bookings});
    delete from public.booking_events where booking_id in (${bookings});
    delete from public.booking_legs where booking_id in (${bookings});
    delete from public.guest_otps where phone like '+62857${RUN}%';
    delete from public.security_alerts where details ->> 'booking_id' in (select id::text from (${bookings}) b);
    delete from public.bookings where package_id in ('${PACKAGE_ID}', '${COMBO_ID}');
    update public.visit_sessions set reserved_pax = 0 where id in (${SESSIONS.map((id) => `'${id}'`).join(', ')});
    delete from public.visit_sessions where id in (${SESSIONS.map((id) => `'${id}'`).join(', ')});
    delete from public.package_price_history where package_id in ('${PACKAGE_ID}', '${COMBO_ID}');
    delete from public.tour_packages where id in ('${PACKAGE_ID}', '${COMBO_ID}');
    delete from public.audit_logs where id > ${String(auditIdBefore)};`);
}, SLOW_MS);

describe('internal.create_booking through booking-service', () => {
  it(
    'lets exactly the ten holds there is room for through, of twenty at once',
    async () => {
      const requests = await Promise.all(
        Array.from({ length: PARALLEL_HOLDS }, (_, index) => requestFor(index, [RACE_SESSION])),
      );
      const outcomes = await Promise.allSettled(requests.map((request) => createHold(request)));

      const created = outcomes.filter((outcome) => outcome.status === 'fulfilled');
      expect(created).toHaveLength(ROOM_LEFT);
      for (const outcome of created) expect(outcome.value).toMatchObject({ kind: 'created' });
      const refusals = outcomes
        .filter((outcome): outcome is PromiseRejectedResult => outcome.status === 'rejected')
        .map((outcome): unknown => outcome.reason);
      expect(await Promise.all(refusals.map(errorCodeOf))).toEqual(
        Array(PARALLEL_HOLDS - ROOM_LEFT).fill('QUOTA_EXCEEDED'),
      );
      expect(await reservedOf(RACE_SESSION)).toBe(40);
    },
    SLOW_MS,
  );

  it('takes both seats of a combo or neither', async () => {
    const refusal = createHold(
      await requestFor(30, [OPEN_SESSION, FULL_SESSION_13], { combo: true, pax: 2 }),
    );
    await expect(refusal.catch(errorCodeOf)).resolves.toBe('QUOTA_EXCEEDED');
    expect(await reservedOf(OPEN_SESSION)).toBe(0);
  });

  it('holds no seat for a quotation', async () => {
    const outcome = await createQuotedBooking(await requestFor(31, [OPEN_SESSION], { pax: 5 }));
    expect(outcome).toMatchObject({ kind: 'created', status: 'quoted', expiresAt: null });
    expect(await reservedOf(OPEN_SESSION)).toBe(0);
  });

  it('refuses a total sent with the form before it reaches the database', async () => {
    const request = await requestFor(32, [OPEN_SESSION]);
    expect(createBookingSchema(500).safeParse({ ...request.values, total: 1 }).success).toBe(false);
  });

  it('refuses a hold whose catalogue price changed after the summary', async () => {
    const request = await requestFor(33, [OPEN_SESSION]);
    await runSql(
      `update public.tour_packages set price_per_pax = 31000 where id = '${PACKAGE_ID}'`,
    );
    try {
      await expect(createHold(request).catch(errorCodeOf)).resolves.toBe('PRICE_MISMATCH');
    } finally {
      await runSql(
        `update public.tour_packages set price_per_pax = ${String(PRICE_PER_PAX)} where id = '${PACKAGE_ID}'`,
      );
    }
    expect(await reservedOf(OPEN_SESSION)).toBe(0);
  });

  it('refuses a third unpaid hold for one phone', async () => {
    const first = await requestFor(34, [OPEN_SESSION]);
    const second = await requestFor(34, [SPARE_SESSION]);
    await expect(createHold(first)).resolves.toMatchObject({ kind: 'created' });
    await expect(createHold(second)).resolves.toMatchObject({ kind: 'created' });
    const third = await requestFor(34, [SHARE_SESSION]);
    await expect(createHold(third).catch(errorCodeOf)).resolves.toBe('RATE_LIMITED');
  });

  it('refuses a hold without a verified code', async () => {
    const request = await requestFor(35, [OPEN_SESSION]);
    const unverified = { ...request, proof: { ...request.proof, otpId: randomUUID() } };
    await expect(createHold(unverified).catch(errorCodeOf)).resolves.toBe('STATE_INVALID');
  });

  it('asks the visitor to pay to confirm once unpaid holds would pass half the session', async () => {
    await expect(
      createHold(await requestFor(36, [SHARE_SESSION], { pax: 5 })),
    ).resolves.toMatchObject({
      kind: 'created',
    });
    await expect(createHold(await requestFor(37, [SHARE_SESSION]))).resolves.toEqual({
      kind: 'pay_to_confirm',
    });
    expect(await reservedOf(SHARE_SESSION)).toBe(5);
  });

  it('frees the seats of a lapsed hold through the expire-bookings job and tells the visitor', async () => {
    const before = await reservedOf(SPARE_SESSION);
    const outcome = await createHold(await requestFor(38, [SPARE_SESSION], { pax: 3 }));
    if (outcome.kind !== 'created') throw new Error('the hold should have been created');
    await runSql(`select set_config('app.hold_extension', '1', true);
      update public.bookings set expires_at = now() - interval '6 minutes'
      where booking_code = ${sqlText(outcome.bookingCode)}`);

    const response = await expireBookings(
      new Request('http://localhost/api/jobs/expire-bookings', {
        method: 'POST',
        headers: { authorization: `Bearer ${serverEnv.CRON_SECRET}` },
      }),
    );

    expect(response.status).toBe(200);
    const rows = statusRowsSchema.parse(
      await runSql(
        `select status from public.bookings where booking_code = ${sqlText(outcome.bookingCode)}`,
      ),
    );
    expect(rows).toEqual([{ status: 'expired' }]);
    expect(await reservedOf(SPARE_SESSION)).toBe(before);
    const notices = countRowsSchema.parse(
      await runSql(`select count(*) from public.notifications n join public.bookings b on b.id = n.booking_id
        where b.booking_code = ${sqlText(outcome.bookingCode)} and n.template = 'booking_expired'`),
    );
    expect(notices[0]?.count).toBe(2);
  });
});
