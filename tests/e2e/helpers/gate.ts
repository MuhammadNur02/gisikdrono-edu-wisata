import { randomInt, randomUUID } from 'node:crypto';

import { z } from 'zod';

import { runSql, sqlText } from '../../../scripts/local-stack';

// Paid bookings whose ticket opens at the gate now, for the scanner specs that go through the real
// POST /api/tickets/verify (Task P4.4.05). A booking is held and paid the way a confirmed settlement pays it; its
// ticket's day and window are then set to now, since create_booking never books a session within the lead time.
// Paid rows stay behind (payments are never deleted), so every id and phone number is this run's own.

const PAX = 6;
const idRowsSchema = z.array(z.object({ id: z.uuid() }));
const ticketRowsSchema = z.array(z.object({ id: z.uuid(), booking_code: z.string() }));

export interface GateTicket {
  ticketId: string;
  bookingCode: string;
  phoneLastDigits: string;
  paxCount: number;
  institutionName: string;
}

async function firstId(query: string): Promise<string> {
  const row = idRowsSchema.parse(await runSql(query))[0];
  if (!row) throw new Error('the query answered no row');
  return row.id;
}

async function packageFor(
  rwId: number,
  run: string,
): Promise<{ packageId: string; sessionId: string }> {
  const packageId = randomUUID();
  const sessionId = randomUUID();
  await runSql(`insert into public.tour_packages (id, rw_id, category, slug, name, pricing_basis, price_per_pax, status)
      values ('${packageId}', ${String(rwId)}, 'regular', 'uji-e2e-gerbang-${run}', 'Paket Uji Gerbang', 'per_pax',
              25000, 'published');
    insert into public.visit_sessions (id, rw_id, session_date, start_time, end_time, label, capacity)
      values ('${sessionId}', ${String(rwId)}, public.today_jkt() + 11, '07:29', '08:29', 'Uji e2e ${run}', 200);`);
  return { packageId, sessionId };
}

function settleSql(bookingId: string): string {
  return `select set_config('app.qr_key_id', 'k1', true);
    do $$
    declare
      attempt jsonb := internal.create_payment_attempt('${bookingId}', null, null);
      answer jsonb;
    begin
      perform internal.attach_snap_token((attempt ->> 'payment_id')::uuid, 'token-' || (attempt ->> 'order_id'),
        'https://app.sandbox.midtrans.com/snap/v4/redirection/' || (attempt ->> 'order_id'));
      answer := jsonb_build_object('order_id', attempt ->> 'order_id', 'status_code', '200',
        'gross_amount', (select b.total_amount from public.bookings b where b.id = '${bookingId}') || '.00',
        'signature_key', repeat('a', 128), 'transaction_status', 'settlement',
        'transaction_id', 'txn-' || (attempt ->> 'order_id'), 'payment_type', 'qris', 'currency', 'IDR',
        'fraud_status', 'accept',
        'settlement_time', to_char(now() at time zone 'Asia/Jakarta', 'YYYY-MM-DD HH24:MI:SS'));
      perform internal.apply_payment_event((internal.record_payment_event('webhook',
        encode(sha256(convert_to(answer::text, 'UTF8')), 'hex'), answer) ->> 'event_id')::bigint, 'webhook', answer,
        'k1');
    end;
    $$;
    update public.tickets_qr
    set valid_on = public.today_jkt(), valid_from = now() - interval '1 hour', valid_until = now() + interval '1 hour'
    where booking_id = '${bookingId}';`;
}

// One paid booking of the RW with its ticket open now.
export async function paidTicketToday(rwId: number): Promise<GateTicket> {
  const run = String(randomInt(100000, 999999));
  const phone = `+62857${run}${String(rwId).padStart(2, '0')}`;
  const institutionName = `SD Negeri Gerbang ${run}`;
  const { packageId, sessionId } = await packageFor(rwId, run);
  const otpId =
    await firstId(`insert into public.guest_otps (purpose, phone, code_hash, browser_hash, expires_at,
      verified_at) values ('booking_phone', ${sqlText(phone)}, repeat('a', 64), repeat('b', 64),
      now() + interval '5 minutes', now()) returning id`);
  const booker = JSON.stringify({
    booker_type: 'school',
    institution_name: institutionName,
    pic_name: 'Siti Gerbang',
    pic_phone: phone,
    pic_email: `gerbang${run}@contoh.test`,
    notes: null,
  });
  const bookingId =
    await firstId(`select (internal.create_booking('${packageId}', array['${sessionId}']::uuid[],
      ${String(PAX)}, ${sqlText(booker)}::jsonb, '[]', '[]', 'pay', 'web', null, '${otpId}',
      '{"version": "2026-10-18"}', null, '{"ip": null, "user_agent": "e2e"}',
      internal.booking_quote_hash(internal.booking_quote('${packageId}', ${String(PAX)}, '[]',
                                                         array[${String(rwId)}]::smallint[]))) ->> 'booking_id')::uuid
      as id`);
  await runSql(settleSql(bookingId));
  const ticket = ticketRowsSchema.parse(
    await runSql(`select t.id, b.booking_code from public.tickets_qr t join public.bookings b on b.id = t.booking_id
      where t.booking_id = '${bookingId}'`),
  )[0];
  if (!ticket) throw new Error('the paid booking has no ticket');
  return {
    ticketId: ticket.id,
    bookingCode: ticket.booking_code,
    phoneLastDigits: phone.slice(-4),
    paxCount: PAX,
    institutionName,
  };
}

// A token naming the ticket with a signature nobody made: the route passes a ticket the officer cannot read on
// unchecked, and the database answers it wrong_rw (docs/Security.md §9.2).
export function unsignedTokenFor(ticketId: string): string {
  const id = Buffer.from(ticketId.replace(/-/g, ''), 'hex').toString('base64url');
  return ['GSK', 'k1', id, 'z'.repeat(22)].join('.');
}
