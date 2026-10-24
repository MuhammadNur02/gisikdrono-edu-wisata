import { randomInt, randomUUID } from 'node:crypto';

import { beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';

import { localCronSecret } from '../../scripts/local-server-env';
import { runSql, sqlText } from '../../scripts/local-stack';

// Task P4.4.02 and P4.4.05 against the real stack (CLAUDE.md §7.4; docs/Security.md §9.2, §9.3): two officers
// committing one ticket at the same moment, each in a transaction and on a connection of its own, let the group in
// once; and past 30 distinct bad QR payloads an officer is slowed down, not locked out. The officers are this run's
// own RW 05 admins, acting through request.jwt.claims the way PostgREST sets them, through scan_ticket, the gate's one
// entry point, with the attestation the route would give (made here by internal.scanner_attestation). Paid rows stay behind (payments are
// never deleted), so every id here is this run's own.

const RUN = String(randomInt(100000, 999999));
const PACKAGE_ID = randomUUID();
const SESSION_ID = randomUUID();
const OFFICERS = [randomUUID(), randomUUID(), randomUUID()] as const;
// A session of its own: a session is unique per RW, day and start, and earlier runs' sessions stay with their bookings.
const SESSION_DAY_OFFSET = randomInt(8, 29);
const SESSION_START = `${String(randomInt(5, 20)).padStart(2, '0')}:${String(randomInt(0, 60)).padStart(2, '0')}`;
const RACING_TICKETS = 3;
const PAX = 5;
const BAD_PAYLOADS = 31;
const SLOW_MS = 120_000;
const MS_PER_SECOND = 1000;
// A little over the wait the database asks for, so the next request lands after it.
const WAIT_MARGIN_MS = 300;

const idRowsSchema = z.array(z.object({ id: z.uuid() }));
const answerRowsSchema = z.array(z.object({ answer: z.object({ result: z.string() }) }));
const replyRowsSchema = z.array(z.object({ answer: z.record(z.string(), z.unknown()) }));
const EXPIRES_AT_SQL = 'floor(extract(epoch from now()))::bigint + 60';

function phoneOf(index: number): string {
  return `+62859${RUN}${String(index).padStart(2, '0')}`;
}

// One transaction as an RW 05 officer at AAL2, the claims the access-token hook would have given them.
// What comes before the role switch runs as postgres, as the route's own work does on the server.
function asOfficer(officerId: string, statement: string, beforeRole = ''): string {
  return `${beforeRole}
    select set_config('request.jwt.claims', (jsonb_build_object(
      'sub', '${officerId}', 'role', 'authenticated', 'aal', 'aal2',
      'amr', jsonb_build_array(jsonb_build_object('method', 'totp',
                                                  'timestamp', extract(epoch from now())::bigint)))
      || internal.staff_token_claims('${officerId}'))::text, true);
    set local role authenticated;
    ${statement}`;
}

async function firstId(query: string): Promise<string> {
  const row = idRowsSchema.parse(await runSql(query))[0];
  if (!row) throw new Error('the query answered no row');
  return row.id;
}

// A booking held, paid by a confirmed settlement, and its ticket's gate opened now: create_booking never books a
// session that starts within the lead time, and the gate reads the ticket's own day and window.
async function paidTicket(index: number): Promise<string> {
  const otpId =
    await firstId(`insert into public.guest_otps (purpose, phone, code_hash, browser_hash, expires_at,
      verified_at) values ('booking_phone', ${sqlText(phoneOf(index))}, repeat('a', 64), repeat('b', 64),
      now() + interval '5 minutes', now()) returning id`);
  const booker = JSON.stringify({
    booker_type: 'school',
    institution_name: 'SD Negeri Gerbang Uji',
    pic_name: 'Ani Gerbang',
    pic_phone: phoneOf(index),
    pic_email: `gerbang${RUN}${String(index)}@contoh.test`,
    notes: null,
  });
  const bookingId =
    await firstId(`select (internal.create_booking('${PACKAGE_ID}', array['${SESSION_ID}']::uuid[],
      ${String(PAX)}, ${sqlText(booker)}::jsonb, '[]', '[]', 'pay', 'web', null, '${otpId}',
      '{"version": "2026-10-18"}', null, '{"ip": null, "user_agent": "integration"}',
      internal.booking_quote_hash(internal.booking_quote('${PACKAGE_ID}', ${String(PAX)}, '[]',
                                                         array[5]::smallint[]))) ->> 'booking_id')::uuid as id`);
  await runSql(`select set_config('app.qr_key_id', 'k1', true);
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
    where booking_id = '${bookingId}';`);
  return firstId(`select id from public.tickets_qr where booking_id = '${bookingId}'`);
}

async function commit(officerId: string, ticketId: string): Promise<string> {
  const attemptId = randomUUID();
  const attest = `select set_config('scan.expires_at', (${EXPIRES_AT_SQL})::text, true);
    select set_config('scan.attestation', internal.scanner_attestation('${officerId}', '${ticketId}', '${attemptId}',
      'commit', 'qr', current_setting('scan.expires_at')::bigint), true);`;
  const scan = `select public.scan_ticket('commit', '${attemptId}', 'qr', 'GSK.k1.race-${RUN}', '{}', '${ticketId}',
      ${String(PAX)}, null, current_setting('scan.attestation'), current_setting('scan.expires_at')::bigint) as answer`;
  const rows = answerRowsSchema.parse(await runSql(asOfficer(officerId, scan, attest)));
  return rows[0]?.answer.result ?? 'none';
}

// One QR preview whose signature failed, after whatever else the transaction does first.
async function badScan(officerId: string, before = ''): Promise<Record<string, unknown>> {
  const scan = `${before} select public.scan_ticket('preview', gen_random_uuid(), 'qr',
      'GSK.k1.bad-${RUN}-' || gen_random_uuid()) as answer`;
  const answer = replyRowsSchema.parse(await runSql(asOfficer(officerId, scan)))[0]?.answer;
  if (!answer) throw new Error('scan_ticket answered nothing');
  return answer;
}

beforeAll(async () => {
  const officers = OFFICERS.map(
    (id, index) => `('${id}', 'gerbang${RUN}${String(index)}@example.test')`,
  );
  // The key the attestations are made and checked with: the seed's cron_secret, or the same value it would write.
  await runSql(`select vault.create_secret(${sqlText(localCronSecret())}, 'cron_secret')
    where not exists (select 1 from vault.secrets where name = 'cron_secret');
    insert into auth.users (id, email) values ${officers.join(', ')};
    insert into public.profiles (id, email, full_name, role, rw_id)
      select u.id, u.email, 'Petugas Uji ' || right(u.email, 20), 'admin_rw', 5 from auth.users u
      where u.id in (${OFFICERS.map((id) => `'${id}'`).join(', ')});
    insert into public.tour_packages (id, rw_id, category, slug, name, pricing_basis, price_per_pax, status)
      values ('${PACKAGE_ID}', 5, 'regular', 'uji-integrasi-gerbang-${RUN}', 'Paket Uji Gerbang', 'per_pax', 25000,
              'published');
    insert into public.visit_sessions (id, rw_id, session_date, start_time, end_time, label, capacity)
      values ('${SESSION_ID}', 5, public.today_jkt() + ${String(SESSION_DAY_OFFSET)}, '${SESSION_START}',
              '${SESSION_START}'::time + interval '1 hour', 'Uji gerbang ${RUN}', 200);`);
}, SLOW_MS);

describe('the gate against the real stack', () => {
  it(
    'lets a group in once when two officers commit its ticket at the same moment',
    async () => {
      for (let index = 0; index < RACING_TICKETS; index += 1) {
        const ticketId = await paidTicket(index);
        const results = await Promise.all([
          commit(OFFICERS[0], ticketId),
          commit(OFFICERS[1], ticketId),
        ]);
        expect(results.sort()).toEqual(['already_used', 'ok']);
        const counted = z
          .array(z.object({ checked_in_pax: z.number() }))
          .parse(
            await runSql(`select checked_in_pax from public.tickets_qr where id = '${ticketId}'`),
          );
        expect(counted).toEqual([{ checked_in_pax: PAX }]);
      }
      const session = z
        .array(z.object({ checked_in_pax: z.number() }))
        .parse(
          await runSql(
            `select checked_in_pax from public.visit_sessions where id = '${SESSION_ID}'`,
          ),
        );
      expect(session).toEqual([{ checked_in_pax: PAX * RACING_TICKETS }]);
    },
    SLOW_MS,
  );

  it(
    'slows an officer down after 31 distinct bad payloads, and lets them on once the wait is over',
    async () => {
      const officer = OFFICERS[2];
      expect(await badScan(officer)).toMatchObject({ result: 'invalid_signature' });
      const thirtyMore = `select count(public.scan_ticket('preview', gen_random_uuid(), 'qr',
          'GSK.k1.bad-${RUN}-' || g)) from generate_series(2, ${String(BAD_PAYLOADS)}) as g;`;

      expect(await badScan(officer, thirtyMore)).toEqual({ slowed: true, retry_after_seconds: 1 });

      await new Promise((resolve) => setTimeout(resolve, MS_PER_SECOND + WAIT_MARGIN_MS));
      expect(await badScan(officer)).toMatchObject({ result: 'invalid_signature' });
      const lockouts = z.array(z.object({ count: z.coerce.number() })).parse(
        await runSql(`select count(*) from public.security_events
            where event_type = 'scanner_lockout' and actor_id = '${officer}'`),
      );
      expect(lockouts).toEqual([{ count: 1 }]);
    },
    SLOW_MS,
  );
});
