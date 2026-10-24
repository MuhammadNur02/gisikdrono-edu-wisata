import { randomInt, randomUUID } from 'node:crypto';

import { createClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import type { Database } from '@/db/types';
import { pollPayments } from '@/server/services/payment-poll';
import { startPayment } from '@/server/services/payment-service';

import { localStack, runSql, sqlText } from '../../scripts/local-stack';
import { simulatedNotification, type SimulatedStatus } from '../../scripts/midtrans-notification';
import { POST } from '../../src/app/api/webhooks/midtrans/[token]/route';
import { sandboxEnv } from '../fixtures/env';
import { startMidtransStub, type MidtransStub } from '../fixtures/midtrans-stub';

// Task P3.8.03, P3.8.05 and P3.9.02 against the real stack (docs/PRD.md §10.1): a hold's Snap page from the stand-in
// of MIDTRANS_LOCAL_STUB_URL, then signed notifications through the webhook route, or none and the payments poll, the
// Status API answered by the same stand-in. The unit tests stand in for the database; only this run proves the whole path pays a booking once.
// Paid rows stay behind (payments are never deleted), so every id here is this run's own.

const STUB_PORT = 4011;
// Set before src/lib/env.ts reads the environment, which it does once, on import.
vi.hoisted(() => {
  vi.stubEnv('MIDTRANS_LOCAL_STUB_URL', 'http://127.0.0.1:4011');
});
vi.mock('next/server', () => ({ after: vi.fn() }));
vi.mock('@/lib/supabase/admin', () => ({
  createSupabaseAdminClient: () =>
    createClient<Database>(localStack().apiUrl, localStack().serviceRoleKey, {
      auth: { persistSession: false },
    }),
}));

const PACKAGE_ID = randomUUID();
const SESSION_ID = randomUUID();
const RUN = String(randomInt(100000, 999999));
const SLOW_MS = 120_000;
// A session of this run's own hour and minute, since a run before it today left its session behind with its payments.
const SESSION_START_MINUTE = randomInt(7 * 60, 16 * 60);
const SESSION_MINUTES = 60;

function clockOf(minuteOfDay: number): string {
  const hours = String(Math.floor(minuteOfDay / 60)).padStart(2, '0');
  return `${hours}:${String(minuteOfDay % 60).padStart(2, '0')}`;
}

let stub: MidtransStub;

async function holdFor(flow: number): Promise<{ id: string; code: string }> {
  const phone = `+62857${RUN}${String(flow).padStart(2, '0')}`;
  const otpId = randomUUID();
  const rows = z.array(z.object({ id: z.string(), code: z.string() })).parse(
    await runSql(`insert into public.guest_otps (id, purpose, phone, code_hash, browser_hash, expires_at, verified_at)
        values ('${otpId}', 'booking_phone', ${sqlText(phone)}, repeat('a', 64), repeat('b', 64),
                now() + interval '5 minutes', now());
      with made as (
        select internal.create_booking('${PACKAGE_ID}', array['${SESSION_ID}']::uuid[], 20,
          jsonb_build_object('booker_type', 'school', 'institution_name', 'SD Negeri Bayar', 'pic_name', 'Ani Bayar',
                             'pic_phone', ${sqlText(phone)}, 'pic_email', 'bayar-integrasi@contoh.test', 'notes', null),
          '[]', '[]', 'pay', 'web', null, '${otpId}', '{"version": "2026-10-18"}', null,
          '{"ip": null, "user_agent": "Integration"}',
          internal.booking_quote_hash(internal.booking_quote('${PACKAGE_ID}', 20, '[]', array[5]::smallint[])))
          as reply)
      select reply ->> 'booking_id' as id, reply ->> 'booking_code' as code from made;`),
  );
  const [row] = rows;
  if (!row) throw new Error('no hold was made');
  return row;
}

function webhookPost(body: Record<string, unknown>): Promise<Response> {
  const request = new Request('http://127.0.0.1:3000/api/webhooks/midtrans/token', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return POST(request, {
    params: Promise.resolve({ token: sandboxEnv.MIDTRANS_WEBHOOK_PATH_TOKEN }),
  });
}

// What Midtrans would send once the visitor paid: the stand-in says so to the Status API too.
function paidNotification(orderId: string, status: SimulatedStatus, grossAmount = '600000.00') {
  const order = stub.orders.get(orderId);
  if (order) order.transactionStatus = status;
  return simulatedNotification({
    orderId,
    status,
    grossAmount,
    transactionId: order?.transactionId,
    serverKey: sandboxEnv.MIDTRANS_SERVER_KEY,
    merchantId: sandboxEnv.MIDTRANS_MERCHANT_ID,
  });
}

function serviceClient() {
  return createClient<Database>(localStack().apiUrl, localStack().serviceRoleKey, {
    auth: { persistSession: false },
  });
}

// Oldest first and past the two minutes a visitor is still paying in, so the next poll run asks about it.
async function makePollable(orderId: string): Promise<void> {
  await runSql(`update public.payments set created_at = now() - interval '47 hours'
      where order_id = ${sqlText(orderId)}`);
}

async function stateOf(bookingId: string) {
  const rows = z
    .array(
      z.object({
        booking: z.string(),
        payment: z.string().nullable(),
        invoice: z.string().nullable(),
        receipt: z.string().nullable(),
        ticket_messages: z.number(),
        tickets: z.number(),
        ledger: z.number(),
      }),
    )
    .parse(
      await runSql(`select b.status::text as booking,
          (select p.status::text from public.payments p where p.booking_id = b.id order by p.attempt_no desc limit 1)
            as payment,
          (select i.invoice_number from public.invoices i where i.booking_id = b.id) as invoice,
          (select i.receipt_number from public.invoices i where i.booking_id = b.id) as receipt,
          (select count(*)::int from public.notifications n
           where n.booking_id = b.id and n.template = 'payment_received_ticket') as ticket_messages,
          (select count(*)::int from public.tickets_qr t where t.booking_id = b.id) as tickets,
          (select coalesce(sum(e.amount), 0)::int from public.revenue_share_entries e
           where e.booking_id = b.id and e.entry_type = 'settlement') as ledger
        from public.bookings b where b.id = '${bookingId}'`),
    );
  return rows[0];
}

beforeAll(async () => {
  stub = await startMidtransStub(STUB_PORT);
  await runSql(`delete from public.rate_limit_buckets where key like 'webhook_%';
    insert into public.tour_packages (id, rw_id, category, slug, name, pricing_basis, price_per_pax, status)
      values ('${PACKAGE_ID}', 5, 'regular', 'uji-integrasi-bayar-${RUN}', 'Paket Uji Bayar', 'per_pax', 30000,
              'published');
    insert into public.visit_sessions (id, rw_id, session_date, start_time, end_time, label, capacity) values
      ('${SESSION_ID}', 5, public.today_jkt() + 6, '${clockOf(SESSION_START_MINUTE)}',
       '${clockOf(SESSION_START_MINUTE + SESSION_MINUTES)}', 'Uji bayar ${RUN}', 200);`);
}, SLOW_MS);

afterAll(async () => {
  await stub.close();
});

describe('a hold paid through Snap and the webhook', () => {
  it(
    'opens a Snap page, settles once on the confirmed notification, and ignores the replay',
    async () => {
      const hold = await holdFor(1);
      const page = await startPayment(hold.id);
      expect(page.redirectUrl.startsWith(`${stub.url}/snap/v4/redirection/`)).toBe(true);
      await expect(startPayment(hold.id)).resolves.toEqual(page);

      const notification = paidNotification(`${hold.code}-01`, 'settlement');
      const settled = await webhookPost(notification);
      expect(settled.status).toBe(200);
      await expect(settled.json()).resolves.toEqual({ status: 'applied' });
      const state = await stateOf(hold.id);
      expect(state).toMatchObject({
        booking: 'paid',
        payment: 'settled',
        ticket_messages: 2,
        tickets: 1,
        ledger: 600000,
      });
      expect(state?.invoice).toMatch(/^INV\/GSK\/\d{4}\/\d{2}\/\d{4,}$/);
      expect(state?.receipt).toMatch(/^KW\/GSK\/\d{4}\/\d{2}\/\d{4,}$/);

      const replay = await webhookPost(notification);
      await expect(replay.json()).resolves.toEqual({ status: 'duplicate_delivery' });
    },
    SLOW_MS,
  );

  it(
    'refuses a forged notification with 403 and keeps its metadata only',
    async () => {
      const hold = await holdFor(2);
      await startPayment(hold.id);
      const forged = { ...paidNotification(`${hold.code}-01`, 'settlement'), gross_amount: '1.00' };
      expect((await webhookPost(forged)).status).toBe(403);
      const rows = z.array(z.object({ reason: z.string(), body_sha256: z.string() })).parse(
        await runSql(`select reason, body_sha256 from public.webhook_rejections
            where order_id = ${sqlText(`${hold.code}-01`)}`),
      );
      expect(rows.map((row) => row.reason)).toEqual(['signature_invalid']);
      expect(rows[0]?.body_sha256).toMatch(/^[0-9a-f]{64}$/);
      expect((await stateOf(hold.id))?.booking).toBe('pending_payment');
    },
    SLOW_MS,
  );

  it(
    'puts a correctly signed settlement of another amount under review, never paid',
    async () => {
      const hold = await holdFor(3);
      await startPayment(hold.id);
      const response = await webhookPost(paidNotification(`${hold.code}-01`, 'settlement', '1.00'));
      await expect(response.json()).resolves.toEqual({ status: 'needs_review' });
      expect(await stateOf(hold.id)).toMatchObject({
        booking: 'pending_payment',
        payment: 'needs_review',
        invoice: null,
        ticket_messages: 0,
      });
    },
    SLOW_MS,
  );

  it(
    'pays a hold whose notification never came on the next payments poll, with its ticket and ledger',
    async () => {
      const hold = await holdFor(4);
      await startPayment(hold.id);
      const order = stub.orders.get(`${hold.code}-01`);
      if (order) order.transactionStatus = 'settlement';
      await makePollable(`${hold.code}-01`);
      const report = await pollPayments(serviceClient());
      expect(report.applied).toBeGreaterThanOrEqual(1);
      expect(await stateOf(hold.id)).toMatchObject({
        booking: 'paid',
        payment: 'settled',
        tickets: 1,
        ledger: 600000,
      });
    },
    SLOW_MS,
  );

  it(
    'writes one ledger and one ticket when the webhook and the poll settle the same order at once',
    async () => {
      const hold = await holdFor(5);
      await startPayment(hold.id);
      await makePollable(`${hold.code}-01`);
      const [webhook] = await Promise.all([
        webhookPost(paidNotification(`${hold.code}-01`, 'settlement')),
        pollPayments(serviceClient()),
      ]);
      expect(webhook.status).toBe(200);
      expect(await stateOf(hold.id)).toMatchObject({
        booking: 'paid',
        payment: 'settled',
        tickets: 1,
        ledger: 600000,
      });
    },
    SLOW_MS,
  );
});
