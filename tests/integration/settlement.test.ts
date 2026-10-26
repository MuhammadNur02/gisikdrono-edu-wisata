import { randomInt, randomUUID } from 'node:crypto';

import { createClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import type { Database } from '@/db/types';
import { startPayment } from '@/server/services/payment-service';

import { runTag, syntheticPhone, syntheticPhonesOf } from './helpers/synthetic';
import { localStack, runSql, sqlText } from '../../scripts/local-stack';
import { simulatedNotification } from '../../scripts/midtrans-notification';
import { POST } from '../../src/app/api/webhooks/midtrans/[token]/route';
import { sandboxEnv } from '../fixtures/env';
import { startMidtransStub, type MidtransStub } from '../fixtures/midtrans-stub';

// The settlements that come at the wrong moment, through the real webhook route and the Midtrans stand-in (Task
// P5.1.02; docs/Security.md §3.4, PAY-07, REC-05; docs/PRD.md §9.2): a settlement after the hold lapsed takes its
// seats again when they are free and otherwise stands paid under review without tickets; a second settled attempt
// of a paid booking is recorded as a duplicate with a high alert and no second invoice or ledger; and across them the
// ledger of every paid booking adds up to its total and its hash chain verifies. Paid rows are never deleted, so
// every id is this run's own.

const STUB_PORT = 4012;
vi.hoisted(() => {
  vi.stubEnv('MIDTRANS_LOCAL_STUB_URL', 'http://127.0.0.1:4012');
});
vi.mock('next/server', () => ({ after: vi.fn() }));
vi.mock('@/lib/supabase/admin', () => ({
  createSupabaseAdminClient: () =>
    createClient<Database>(localStack().apiUrl, localStack().serviceRoleKey, {
      auth: { persistSession: false },
    }),
}));

const RUN = runTag();
const PACKAGE_ID = randomUUID();
const PRICE_PER_PAX = 30000;
const PAX = 20;
const TOTAL = PRICE_PER_PAX * PAX;
const GROSS = `${String(TOTAL)}.00`;
// Room for the hold with the unpaid share at most half the session (internal.over_unpaid_share).
const ROOMY = 200;
const TIGHT = 2 * PAX;
const SESSIONS = { roomy: randomUUID(), tight: randomUUID(), duplicate: randomUUID() };
const SLOW_MS = 120_000;
const START_MINUTE = randomInt(7 * 60, 14 * 60);

let stub: MidtransStub;

const clockOf = (minute: number) =>
  `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;

async function holdFor(flow: number, sessionId: string): Promise<{ id: string; code: string }> {
  const phone = syntheticPhone(RUN, flow);
  const otpId = randomUUID();
  const rows = z.array(z.object({ id: z.string(), code: z.string() })).parse(
    await runSql(`insert into public.guest_otps (id, purpose, phone, code_hash, browser_hash, expires_at, verified_at)
        values ('${otpId}', 'booking_phone', ${sqlText(phone)}, repeat('a', 64), repeat('b', 64),
                now() + interval '5 minutes', now());
      with made as (
        select internal.create_booking('${PACKAGE_ID}', array['${sessionId}']::uuid[], ${String(PAX)},
          jsonb_build_object('booker_type', 'school', 'institution_name', 'SD Negeri Lunas', 'pic_name', 'Ani Lunas',
                             'pic_phone', ${sqlText(phone)}, 'pic_email', 'lunas-integrasi@contoh.test', 'notes', null),
          '[]', '[]', 'pay', 'web', null, '${otpId}', '{"version": "2026-10-18"}', null,
          '{"ip": null, "user_agent": "Integration"}',
          internal.booking_quote_hash(internal.booking_quote('${PACKAGE_ID}', ${String(PAX)}, '[]',
                                                             array[5]::smallint[]))) as reply)
      select reply ->> 'booking_id' as id, reply ->> 'booking_code' as code from made;`),
  );
  const [row] = rows;
  if (!row) throw new Error('no hold was made');
  return row;
}

// What Midtrans sends once the visitor paid; the stand-in says so to the Status API as well.
async function settle(orderId: string): Promise<Response> {
  const order = stub.orders.get(orderId);
  if (!order) throw new Error(`the stand-in knows no order ${orderId}`);
  order.transactionStatus = 'settlement';
  const body = simulatedNotification({
    orderId,
    status: 'settlement',
    grossAmount: GROSS,
    transactionId: order.transactionId,
    serverKey: sandboxEnv.MIDTRANS_SERVER_KEY,
    merchantId: sandboxEnv.MIDTRANS_MERCHANT_ID,
  });
  return POST(
    new Request('http://127.0.0.1:3000/api/webhooks/midtrans/token', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ token: sandboxEnv.MIDTRANS_WEBHOOK_PATH_TOKEN }) },
  );
}

// The hold's deadline moved past the expiry job's five minutes of grace, then the job's own run.
async function lapse(bookingId: string): Promise<void> {
  await runSql(`select set_config('app.hold_extension', '1', true);
    update public.bookings set expires_at = now() - interval '6 minutes' where id = '${bookingId}';`);
  await runSql('select internal.expire_stale_bookings()');
}

const stateSchema = z.array(
  z.object({
    booking: z.string(),
    needs_review: z.boolean(),
    review_reason: z.string().nullable(),
    last_reason: z.string().nullable(),
    tickets: z.number(),
    invoices: z.number(),
    ledger: z.number(),
    reserved: z.number(),
  }),
);

async function stateOf(bookingId: string, sessionId: string) {
  const rows = stateSchema.parse(
    await runSql(`select b.status::text as booking, b.needs_review, b.review_reason,
        (select e.reason from public.booking_events e where e.booking_id = b.id and e.to_status = 'paid'
         order by e.id desc limit 1) as last_reason,
        (select count(*)::int from public.tickets_qr t where t.booking_id = b.id) as tickets,
        (select count(*)::int from public.invoices i where i.booking_id = b.id) as invoices,
        (select coalesce(sum(e.amount), 0)::int from public.revenue_share_entries e where e.booking_id = b.id) as ledger,
        (select s.reserved_pax from public.visit_sessions s where s.id = '${sessionId}') as reserved
      from public.bookings b where b.id = '${bookingId}'`),
  );
  return rows[0];
}

// CLAUDE.md §7.2 (review of PR #84, L-2): a duplicate settlement leaves its refund task, the open high alert that
// names the order and the amount to give back and that record_refund closes, and every superadmin is told by email.
async function expectRefundTask(bookingId: string, code: string, order: string): Promise<void> {
  const task = z
    .array(z.object({ title: z.string(), order_id: z.string(), amount: z.coerce.number() }))
    .parse(
      await runSql(`select title, details ->> 'order_id' as order_id, details ->> 'amount' as amount
        from public.security_alerts where fingerprint = ${sqlText(`duplicate_settlement:${order}`)}
          and acknowledged_at is null`),
    );
  expect(task.map((row) => [row.order_id, row.amount])).toEqual([[order, TOTAL]]);
  expect(task[0]?.title).toContain('kembalikan dananya');
  const told = z.array(z.object({ count: z.coerce.number() })).parse(
    await runSql(`select count(*) from public.notifications n
        where n.template = 'admin_booking_needs_review' and n.params ->> 'booking_code' = ${sqlText(code)}
          and n.params ->> 'reason' = 'DUPLICATE_SETTLEMENT' and n.dedupe_key like ${sqlText(`booking:${bookingId}:%`)}`),
  );
  expect(told[0]?.count).toBeGreaterThanOrEqual(1);
}

const paidBookings: string[] = [];

beforeAll(async () => {
  stub = await startMidtransStub(STUB_PORT);
  await runSql(`delete from public.rate_limit_buckets where key like 'webhook_%';
    insert into public.tour_packages (id, rw_id, category, slug, name, pricing_basis, price_per_pax, status)
      values ('${PACKAGE_ID}', 5, 'regular', 'uji-lunas-${RUN}', 'Paket Uji Lunas', 'per_pax', ${String(PRICE_PER_PAX)},
              'published');
    insert into public.visit_sessions (id, rw_id, session_date, start_time, end_time, label, capacity) values
      ('${SESSIONS.roomy}', 5, public.today_jkt() + 8, '${clockOf(START_MINUTE)}', '${clockOf(START_MINUTE + 50)}',
       'Uji lunas ${RUN} a', ${String(ROOMY)}),
      ('${SESSIONS.tight}', 5, public.today_jkt() + 8, '${clockOf(START_MINUTE + 60)}', '${clockOf(START_MINUTE + 110)}',
       'Uji lunas ${RUN} b', ${String(TIGHT)}),
      ('${SESSIONS.duplicate}', 5, public.today_jkt() + 8, '${clockOf(START_MINUTE + 120)}',
       '${clockOf(START_MINUTE + 170)}', 'Uji lunas ${RUN} c', ${String(ROOMY)});`);
}, SLOW_MS);

// Paid bookings, their payments, ledger and sessions stay (payments are never deleted, and a session with bookings
// cannot be); the codes, the duplicate's alert and the staff messages about it go.
afterAll(async () => {
  await stub.close();
  await runSql(`select set_config('app.purge', 'on', true);
    delete from public.guest_otps where phone like '${syntheticPhonesOf(RUN)}';
    delete from public.notifications where template = 'admin_booking_needs_review'
      and dedupe_key like any (array[${paidBookings.map((id) => sqlText(`booking:${id}:%`)).join(', ') || "''"}]);
    delete from public.security_alerts where rule = 'duplicate_settlement'
      and details ->> 'booking_id' = any (array[${paidBookings.map(sqlText).join(', ') || "''"}]);`);
});

describe('a settlement after the hold lapsed', () => {
  it(
    'takes the seats again when they are still free, with its tickets and ledger',
    async () => {
      const hold = await holdFor(1, SESSIONS.roomy);
      await startPayment(hold.id);
      await lapse(hold.id);
      expect(await stateOf(hold.id, SESSIONS.roomy)).toMatchObject({
        booking: 'expired',
        reserved: 0,
      });

      expect((await settle(`${hold.code}-01`)).status).toBe(200);
      expect(await stateOf(hold.id, SESSIONS.roomy)).toEqual({
        booking: 'paid',
        needs_review: false,
        review_reason: 'LATE_SETTLEMENT_REQUOTA',
        last_reason: 'revived_late_settlement',
        tickets: 1,
        invoices: 1,
        ledger: TOTAL,
        reserved: PAX,
      });
      paidBookings.push(hold.id);
    },
    SLOW_MS,
  );

  it(
    'stands paid under review without tickets when the session filled meanwhile',
    async () => {
      const hold = await holdFor(2, SESSIONS.tight);
      await startPayment(hold.id);
      await lapse(hold.id);
      await runSql(`select internal.reserve_session_quota('${SESSIONS.tight}', ${String(TIGHT)})`);

      expect((await settle(`${hold.code}-01`)).status).toBe(200);
      expect(await stateOf(hold.id, SESSIONS.tight)).toMatchObject({
        booking: 'paid',
        needs_review: true,
        review_reason: 'PAID_AFTER_EXPIRY_NO_QUOTA',
        last_reason: 'paid_after_expiry_no_quota',
        tickets: 0,
        reserved: TIGHT,
      });
      paidBookings.push(hold.id);
    },
    SLOW_MS,
  );
});

describe('a second settled attempt of a paid booking', () => {
  it(
    'is recorded as a duplicate with a high alert, and pays nothing twice',
    async () => {
      const hold = await holdFor(3, SESSIONS.duplicate);
      await startPayment(hold.id);
      const firstOrder = `${hold.code}-01`;
      const secondOrder = `${hold.code}-02`;
      // The visitor opened a second Snap page, which closed the first attempt in the database (create_payment_attempt).
      await runSql(`with second as (
          select internal.create_payment_attempt('${hold.id}',
            (select p.id from public.payments p where p.order_id = ${sqlText(firstOrder)}), null) as attempt)
        select internal.attach_snap_token((attempt ->> 'payment_id')::uuid, 'token-${RUN}',
          'http://127.0.0.1:${String(STUB_PORT)}/snap/v4/redirection/token-${RUN}') from second`);
      stub.orders.set(secondOrder, {
        orderId: secondOrder,
        grossAmount: GROSS,
        transactionId: randomUUID(),
      });

      expect((await settle(secondOrder)).status).toBe(200);
      expect((await settle(firstOrder)).status).toBe(200);

      const payments = z.array(z.object({ order_id: z.string(), status: z.string() })).parse(
        await runSql(`select order_id, status::text from public.payments where booking_id = '${hold.id}'
            order by attempt_no`),
      );
      expect(payments).toEqual([
        { order_id: firstOrder, status: 'duplicate' },
        { order_id: secondOrder, status: 'settled' },
      ]);
      expect(await stateOf(hold.id, SESSIONS.duplicate)).toMatchObject({
        booking: 'paid',
        tickets: 1,
        invoices: 1,
        ledger: TOTAL,
      });
      const alerts = z.array(z.object({ severity: z.string() })).parse(
        await runSql(`select severity::text from public.security_alerts
            where fingerprint = ${sqlText(`duplicate_settlement:${firstOrder}`)} and acknowledged_at is null`),
      );
      expect(alerts).toEqual([{ severity: 'high' }]);
      paidBookings.push(hold.id);
      await expectRefundTask(hold.id, hold.code, firstOrder);
    },
    SLOW_MS,
  );
});

describe('the ledger', () => {
  it('adds up to the total of each booking paid here, and its hash chain verifies', async () => {
    expect(paidBookings).toHaveLength(3);
    const rows = z.array(z.object({ total: z.coerce.number(), ledger: z.coerce.number() })).parse(
      await runSql(`select b.total_amount as total,
            (select coalesce(sum(e.amount), 0) from public.revenue_share_entries e where e.booking_id = b.id) as ledger
          from public.bookings b
          where b.id in (${paidBookings.map((id) => `'${id}'`).join(', ')})`),
    );
    expect(rows).toHaveLength(paidBookings.length);
    for (const row of rows) expect(row.ledger).toBe(row.total);

    const chain = z
      .array(z.object({ result: z.object({ ok: z.boolean() }) }))
      .parse(await runSql('select internal.verify_ledger_chain() as result'));
    expect(chain[0]?.result.ok).toBe(true);
  });
});
