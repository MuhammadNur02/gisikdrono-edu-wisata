import { randomInt, randomUUID } from 'node:crypto';

import { createClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import type { Database } from '@/db/types';
import { startPayment } from '@/server/services/payment-service';

import { localStack, runSql, sqlText } from '../../scripts/local-stack';
import { simulatedNotification, type SimulatedStatus } from '../../scripts/midtrans-notification';
import { POST } from '../../src/app/api/webhooks/midtrans/[token]/route';
import { sandboxEnv } from '../fixtures/env';
import { startMidtransStub, type MidtransStub } from '../fixtures/midtrans-stub';

// Task P3.13.01 (WH-05, WH-06, WH-08, WH-16, REC-06, REC-08), beside payments.test.ts and settlement.test.ts: every
// status a notification can carry through the real webhook route, a notification the Status API contradicts, and a
// ledger that adds up to a total no share divides evenly. Refunds, their ticket revocation and reversal rows are proven
// by the pgTAP suites revenue_share_reversal.sql and adjustments_and_refunds.sql and by settlement.test.ts.

const STUB_PORT = 4013;
vi.hoisted(() => {
  vi.stubEnv('MIDTRANS_LOCAL_STUB_URL', 'http://127.0.0.1:4013');
});
vi.mock('next/server', () => ({ after: vi.fn() }));
vi.mock('@/lib/supabase/admin', () => ({
  createSupabaseAdminClient: () =>
    createClient<Database>(localStack().apiUrl, localStack().serviceRoleKey, {
      auth: { persistSession: false },
    }),
}));

const PACKAGE_ID = randomUUID();
// A price per visitor no revenue split divides evenly: 7 visitors make 233,331 rupiah.
const ODD_PACKAGE_ID = randomUUID();
const ODD_PRICE = 33_333;
const ODD_PAX = 7;
const SESSION_ID = randomUUID();
const RUN = String(randomInt(100000, 999999));
const SLOW_MS = 120_000;
const PAX = 20;
const PRICE = 30_000;

let stub: MidtransStub;

async function holdFor(flow: number, packageId = PACKAGE_ID, pax = PAX) {
  const phone = `+62858${RUN}${String(flow).padStart(2, '0')}`;
  const otpId = randomUUID();
  const rows = z.array(z.object({ id: z.string(), code: z.string() })).parse(
    await runSql(`insert into public.guest_otps (id, purpose, phone, code_hash, browser_hash, expires_at, verified_at)
        values ('${otpId}', 'booking_phone', ${sqlText(phone)}, repeat('a', 64), repeat('b', 64),
                now() + interval '5 minutes', now());
      with made as (
        select internal.create_booking('${packageId}', array['${SESSION_ID}']::uuid[], ${String(pax)},
          jsonb_build_object('booker_type', 'school', 'institution_name', 'SD Negeri Status', 'pic_name', 'Ani Status',
                             'pic_phone', ${sqlText(phone)}, 'pic_email', 'status-integrasi@contoh.test', 'notes', null),
          '[]', '[]', 'pay', 'web', null, '${otpId}', '{"version": "2026-10-18"}', null,
          '{"ip": null, "user_agent": "Integration"}',
          internal.booking_quote_hash(internal.booking_quote('${packageId}', ${String(pax)}, '[]',
                                                             array[5]::smallint[])))
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

// A signed notification of `status`; `statusApiSays` is what the stand-in's Status API answers for the order.
function notification(
  orderId: string,
  status: SimulatedStatus,
  grossAmount: string,
  statusApiSays: string = status,
) {
  const order = stub.orders.get(orderId);
  if (order) order.transactionStatus = statusApiSays;
  return simulatedNotification({
    orderId,
    status,
    grossAmount,
    transactionId: order?.transactionId,
    serverKey: sandboxEnv.MIDTRANS_SERVER_KEY,
    merchantId: sandboxEnv.MIDTRANS_MERCHANT_ID,
  });
}

const stateSchema = z.array(
  z.object({
    booking: z.string(),
    payment: z.string().nullable(),
    tickets: z.number(),
    ledger: z.number(),
    total: z.number(),
  }),
);

async function stateOf(bookingId: string) {
  const rows = stateSchema.parse(
    await runSql(`select b.status::text as booking, b.total_amount::int as total,
        (select p.status::text from public.payments p where p.booking_id = b.id order by p.attempt_no desc limit 1)
          as payment,
        (select count(*)::int from public.tickets_qr t where t.booking_id = b.id) as tickets,
        (select coalesce(sum(e.amount), 0)::int from public.revenue_share_entries e
         where e.booking_id = b.id and e.entry_type = 'settlement') as ledger
      from public.bookings b where b.id = '${bookingId}'`),
  );
  return rows[0];
}

const grossOf = (amount: number) => `${String(amount)}.00`;

beforeAll(async () => {
  stub = await startMidtransStub(STUB_PORT);
  await runSql(`delete from public.rate_limit_buckets where key like 'webhook_%';
    insert into public.tour_packages (id, rw_id, category, slug, name, pricing_basis, price_per_pax, status) values
      ('${PACKAGE_ID}', 5, 'regular', 'uji-status-${RUN}', 'Paket Uji Status', 'per_pax', ${String(PRICE)}, 'published'),
      ('${ODD_PACKAGE_ID}', 5, 'regular', 'uji-ganjil-${RUN}', 'Paket Uji Ganjil', 'per_pax', ${String(ODD_PRICE)},
       'published');
    insert into public.visit_sessions (id, rw_id, session_date, start_time, end_time, label, capacity) values
      ('${SESSION_ID}', 5, public.today_jkt() + 7, '09:${String(randomInt(10, 59))}', '11:00', 'Uji status ${RUN}',
       500);`);
}, SLOW_MS);

afterAll(async () => {
  await stub.close();
});

describe('a notification of each status through the webhook', () => {
  it.each([
    ['pending', 'pending'],
    ['deny', 'denied'],
    ['expire', 'expired'],
    ['cancel', 'cancelled'],
  ] as const)(
    'records %s as a %s payment, issues no ticket and books no ledger row',
    async (status, paymentStatus) => {
      const hold = await holdFor(10 + ['pending', 'deny', 'expire', 'cancel'].indexOf(status));
      await startPayment(hold.id);
      const response = await webhookPost(
        notification(`${hold.code}-01`, status, grossOf(PAX * PRICE)),
      );
      expect(response.status).toBe(200);
      expect(await stateOf(hold.id)).toMatchObject({
        payment: paymentStatus,
        tickets: 0,
        ledger: 0,
      });
      expect((await stateOf(hold.id))?.booking).not.toBe('paid');
    },
    SLOW_MS,
  );
});

describe('a settlement the Status API does not confirm', () => {
  it(
    'is never paid: no ticket, no ledger, the booking still waiting',
    async () => {
      const hold = await holdFor(20);
      await startPayment(hold.id);
      const response = await webhookPost(
        notification(`${hold.code}-01`, 'settlement', grossOf(PAX * PRICE), 'pending'),
      );
      expect(response.status).toBe(200);
      expect(await stateOf(hold.id)).toMatchObject({
        booking: 'pending_payment',
        tickets: 0,
        ledger: 0,
      });
      expect((await stateOf(hold.id))?.payment).not.toBe('settled');
    },
    SLOW_MS,
  );
});

describe('the ledger of a total no share divides evenly', () => {
  it(
    'adds up to the booking total to the rupiah',
    async () => {
      const hold = await holdFor(30, ODD_PACKAGE_ID, ODD_PAX);
      await startPayment(hold.id);
      await webhookPost(
        notification(`${hold.code}-01`, 'settlement', grossOf(ODD_PRICE * ODD_PAX)),
      );
      const state = await stateOf(hold.id);
      expect(state).toMatchObject({ booking: 'paid', payment: 'settled', tickets: 1 });
      expect(state?.total).toBe(ODD_PRICE * ODD_PAX);
      expect(state?.ledger).toBe(ODD_PRICE * ODD_PAX);
    },
    SLOW_MS,
  );
});
