import { createHmac, randomInt, randomUUID } from 'node:crypto';

import type { TestInfo } from '@playwright/test';
import { z } from 'zod';

import { localServerSecret } from '../../../scripts/local-server-env';
import { runSql, sqlText } from '../../../scripts/local-stack';

// Paid bookings whose ticket opens at the gate now, for the scanner specs that go through the real
// POST /api/tickets/verify (Task P4.4.05). A booking is held and paid the way a confirmed settlement pays it; its
// ticket's day and window are then set to now, since create_booking never books a session within the lead time.
// Paid rows stay behind (payments are never deleted), so every id and phone number is this run's own, and so is each
// session: a session is unique per RW, day and start, and the projects and workers run at the same time.

const PAX = 6;
const MINUTES_PER_HOUR = 60;
const FIRST_HOUR = 5;
const HOURS = 15;
const idRowsSchema = z.array(z.object({ id: z.uuid() }));
const ticketRowsSchema = z.array(
  z.object({ id: z.uuid(), booking_code: z.string(), valid_on: z.string() }),
);

export interface GateTicket {
  ticketId: string;
  bookingCode: string;
  phoneLastDigits: string;
  paxCount: number;
  institutionName: string;
  rwId: number;
  validOn: string;
}

// The packages and sessions this worker made, removed again unless a booking holds them.
const made = { packages: [] as string[], sessions: [] as string[] };

async function firstId(query: string): Promise<string> {
  const row = idRowsSchema.parse(await runSql(query))[0];
  if (!row) throw new Error('the query answered no row');
  return row.id;
}

// A start of this project and worker's own: its hour from the worker, its minute from the project and a random part,
// on a day a few weeks out.
function sessionSlotOf(testInfo: TestInfo): { dayOffset: number; start: string } {
  const projectIndex = testInfo.project.name === 'desktop' ? 0 : 1;
  const hour = FIRST_HOUR + (testInfo.parallelIndex % HOURS);
  const minute =
    (projectIndex * (MINUTES_PER_HOUR / 2) + randomInt(0, MINUTES_PER_HOUR / 2)) % MINUTES_PER_HOUR;
  const start = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  return { dayOffset: randomInt(8, 29), start };
}

async function packageFor(rwId: number, run: string, testInfo: TestInfo) {
  const packageId = randomUUID();
  const sessionId = randomUUID();
  const slot = sessionSlotOf(testInfo);
  made.packages.push(packageId);
  made.sessions.push(sessionId);
  await runSql(`insert into public.tour_packages (id, rw_id, category, slug, name, pricing_basis, price_per_pax, status)
      values ('${packageId}', ${String(rwId)}, 'regular', 'uji-e2e-gerbang-${run}', 'Paket Uji Gerbang', 'per_pax',
              25000, 'published');
    insert into public.visit_sessions (id, rw_id, session_date, start_time, end_time, label, capacity)
      values ('${sessionId}', ${String(rwId)}, public.today_jkt() + ${String(slot.dayOffset)}, '${slot.start}',
              '${slot.start}'::time + interval '1 hour', 'Uji e2e ${run}', 200);`);
  return { packageId, sessionId };
}

function settleSql(bookingId: string): string {
  return `select set_config('app.qr_key_id', ${sqlText(localServerSecret('QR_SIGNING_ACTIVE_KID'))}, true);
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
        current_setting('app.qr_key_id'));
    end;
    $$;
    update public.tickets_qr
    set valid_on = public.today_jkt(), valid_from = now() - interval '1 hour', valid_until = now() + interval '1 hour'
    where booking_id = '${bookingId}';`;
}

async function holdFor(rwId: number, run: string, testInfo: TestInfo) {
  const phone = `+62857${run}${String(rwId).padStart(2, '0')}`;
  const institutionName = `SD Negeri Gerbang ${run}`;
  const { packageId, sessionId } = await packageFor(rwId, run, testInfo);
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
  return { bookingId, phone, institutionName };
}

// One paid booking of the RW with its ticket open now.
export async function paidTicketToday(rwId: number, testInfo: TestInfo): Promise<GateTicket> {
  const run = String(randomInt(100000, 999999));
  const hold = await holdFor(rwId, run, testInfo);
  await runSql(settleSql(hold.bookingId));
  const ticket = ticketRowsSchema.parse(
    await runSql(`select t.id, b.booking_code, t.valid_on::text from public.tickets_qr t
      join public.bookings b on b.id = t.booking_id where t.booking_id = '${hold.bookingId}'`),
  )[0];
  if (!ticket) throw new Error('the paid booking has no ticket');
  return {
    ticketId: ticket.id,
    bookingCode: ticket.booking_code,
    phoneLastDigits: hold.phone.slice(-4),
    paxCount: PAX,
    institutionName: hold.institutionName,
    rwId,
    validOn: ticket.valid_on,
  };
}

// Runs after every test of a file, failed ones included: what no booking holds goes again.
export async function removeUnbookedPackages(): Promise<void> {
  const sessions = made.sessions.splice(0).map((id) => `'${id}'`);
  const packages = made.packages.splice(0).map((id) => `'${id}'`);
  if (packages.length === 0) return;
  await runSql(`delete from public.visit_sessions s where s.id in (${sessions.join(', ')})
      and not exists (select 1 from public.booking_legs l where l.visit_session_id = s.id);
    delete from public.tour_packages p where p.id in (${packages.join(', ')})
      and not exists (select 1 from public.bookings b where b.package_id = p.id);`);
}

function base64urlOfUuid(id: string): string {
  return Buffer.from(id.replace(/-/g, ''), 'hex').toString('base64url');
}

// The token src/lib/qr/sign.ts would make for the ticket, with the key the server under test checks it with.
// Playwright cannot load that server-only module, so the CLAUDE.md §7.3 formula is spelled out here for tests alone.
export function signedTokenFor(ticket: GateTicket): string {
  const kid = localServerSecret('QR_SIGNING_ACTIVE_KID');
  const keys = z
    .record(z.string(), z.string())
    .parse(JSON.parse(localServerSecret('QR_SIGNING_KEYS')));
  const key = Buffer.from(keys[kid] ?? '', 'base64');
  const signature = createHmac('sha256', key)
    .update(`GSK.${kid}.${ticket.ticketId}|${String(ticket.rwId)}|${ticket.validOn}`)
    .digest('base64url')
    .slice(0, 22);
  return ['GSK', kid, base64urlOfUuid(ticket.ticketId), signature].join('.');
}

// A token naming the ticket with a signature nobody made: the route passes a ticket the officer cannot read on
// unchecked, and the database answers it wrong_rw (docs/Security.md §9.2).
export function unsignedTokenFor(ticketId: string): string {
  return ['GSK', 'k1', base64urlOfUuid(ticketId), 'z'.repeat(22)].join('.');
}
