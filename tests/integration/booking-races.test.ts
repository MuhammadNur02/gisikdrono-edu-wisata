import { randomInt, randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';

import { lastAuditId } from './helpers/staff-session';
import { runSql, sqlText } from '../../scripts/local-stack';

// internal.create_booking racing itself and the other writers of a session (independent review of PR #26, M1 and
// L2). Each call is its own transaction on its own connection, straight to the function, so booking-service.ts's one
// retry on a deadlock cannot hide one here: every writer must take the audit chain's lock before any row lock.

const PACKAGE_ID = '00000000-0000-4000-9000-0000000d0001';
const BUSY_SESSION = '00000000-0000-4000-9000-0000000d0101';
const TWICE_SESSION = '00000000-0000-4000-9000-0000000d0102';
const CAP_SESSIONS = [
  '00000000-0000-4000-9000-0000000d0103',
  '00000000-0000-4000-9000-0000000d0104',
  '00000000-0000-4000-9000-0000000d0105',
  '00000000-0000-4000-9000-0000000d0106',
];
const SESSIONS = [BUSY_SESSION, TWICE_SESSION, ...CAP_SESSIONS];
const LAPSED_HOLDS = 6;
const RACING_HOLDS = 12;
const RACING_QUOTES = 12;
const UNPAID_PER_PHONE = 2;
// A fresh range of numbers per run, so the daily caps never carry over from an earlier run.
const RUN = String(randomInt(100000, 999999));
const SLOW_MS = 120_000;

const replySchema = z.array(
  z.object({ reply: z.object({ result: z.string(), booking_id: z.string().optional() }) }),
);

function phoneOf(index: number): string {
  return `+62858${RUN}${String(index).padStart(2, '0')}`;
}

async function verifiedOtp(phone: string): Promise<string> {
  const otpId = randomUUID();
  await runSql(`insert into public.guest_otps (id, purpose, phone, code_hash, browser_hash, expires_at, verified_at)
    values ('${otpId}', 'booking_phone', ${sqlText(phone)}, repeat('a', 64), repeat('b', 64),
            now() + interval '5 minutes', now())`);
  return otpId;
}

function bookingSql(request: {
  index: number;
  sessionId: string;
  mode: 'pay' | 'quote';
  otpId: string;
  formId?: string;
}): string {
  const booker = JSON.stringify({
    booker_type: request.mode === 'quote' ? 'school' : 'individual',
    institution_name: request.mode === 'quote' ? 'Sekolah Uji' : null,
    pic_name: 'Tamu Balapan',
    pic_phone: phoneOf(request.index),
    pic_email: `balap${RUN}${String(request.index)}@contoh.test`,
    notes: null,
  });
  const formId = request.formId === undefined ? 'null' : sqlText(request.formId);
  return `select internal.create_booking('${PACKAGE_ID}', array['${request.sessionId}']::uuid[], 1,
      ${sqlText(booker)}::jsonb, '[]', '[]', '${request.mode}', 'web', ${formId}, '${request.otpId}',
      '{"version": "2026-10-18"}', null, '{"ip": null, "user_agent": "race"}',
      internal.booking_quote_hash(internal.booking_quote('${PACKAGE_ID}', 1, '[]', array[5]::smallint[]))) as reply`;
}

async function book(request: Parameters<typeof bookingSql>[0]) {
  const rows = replySchema.parse(await runSql(bookingSql(request)));
  const first = rows[0];
  if (!first) throw new Error('create_booking answered nothing');
  return first.reply;
}

let auditIdBefore = 0;

beforeAll(async () => {
  auditIdBefore = await lastAuditId();
  await runSql(`insert into public.tour_packages (id, rw_id, category, slug, name, pricing_basis, price_per_pax, status)
      values ('${PACKAGE_ID}', 5, 'regular', 'uji-balapan-pesan', 'Paket Uji', 'per_pax', 30000, 'published');
    insert into public.visit_sessions (id, rw_id, session_date, start_time, end_time, label, capacity)
    select id::uuid, 5, public.today_jkt() + 7, start_time::time, start_time::time + interval '50 minutes', 'Uji balapan', capacity
    from (values ('${BUSY_SESSION}', '07:05', 200), ('${TWICE_SESSION}', '08:05', 40),
                 ('${CAP_SESSIONS[0] ?? ''}', '09:05', 40), ('${CAP_SESSIONS[1] ?? ''}', '10:05', 40),
                 ('${CAP_SESSIONS[2] ?? ''}', '11:05', 40), ('${CAP_SESSIONS[3] ?? ''}', '12:05', 40))
      as session(id, start_time, capacity);`);
}, SLOW_MS);

// One query string is one transaction, so the purge and fence switches end with it.
afterAll(async () => {
  const bookings = `select id from public.bookings where package_id = '${PACKAGE_ID}'`;
  const sessions = SESSIONS.map((id) => `'${id}'`).join(', ');
  await runSql(`select set_config('app.purge', 'on', true), set_config('app.in_rpc', '1', true);
    delete from public.notifications where booking_id in (${bookings});
    delete from public.booking_events where booking_id in (${bookings});
    delete from public.booking_legs where booking_id in (${bookings});
    delete from public.guest_otps where phone like '+62858${RUN}%';
    delete from public.bookings where package_id = '${PACKAGE_ID}';
    update public.visit_sessions set reserved_pax = 0 where id in (${sessions});
    delete from public.visit_sessions where id in (${sessions});
    delete from public.tour_packages where id = '${PACKAGE_ID}';
    delete from public.audit_logs where id > ${String(auditIdBefore)};`);
}, SLOW_MS);

describe('create_booking against the other writers of a session', () => {
  it(
    'never deadlocks holds and quotations with the expiry run releasing seats of the same session',
    async () => {
      for (let index = 0; index < LAPSED_HOLDS; index += 1) {
        await book({
          index,
          sessionId: BUSY_SESSION,
          mode: 'pay',
          otpId: await verifiedOtp(phoneOf(index)),
        });
      }
      await runSql(`select set_config('app.hold_extension', '1', true);
        update public.bookings set expires_at = now() - interval '6 minutes' where package_id = '${PACKAGE_ID}'`);

      const holds = await Promise.all(
        Array.from({ length: RACING_HOLDS }, async (_, offset) => {
          const index = 10 + offset;
          return bookingSql({
            index,
            sessionId: BUSY_SESSION,
            mode: 'pay',
            otpId: await verifiedOtp(phoneOf(index)),
          });
        }),
      );
      const quotes = await Promise.all(
        Array.from({ length: RACING_QUOTES }, async (_, offset) => {
          const index = 30 + offset;
          return bookingSql({
            index,
            sessionId: BUSY_SESSION,
            mode: 'quote',
            otpId: await verifiedOtp(phoneOf(index)),
          });
        }),
      );
      const outcomes = await Promise.allSettled(
        [...holds, ...quotes, 'select internal.expire_stale_bookings()'].map((query) =>
          runSql(query),
        ),
      );

      const failures = outcomes.flatMap((outcome) =>
        outcome.status === 'rejected' ? [String(outcome.reason)] : [],
      );
      expect(failures).toEqual([]);
    },
    SLOW_MS,
  );

  it('answers one form sent twice at once with one booking, never as an unverified contact', async () => {
    const otpId = await verifiedOtp(phoneOf(60));
    const formId = randomUUID();
    const twice = await Promise.allSettled(
      [0, 1].map(() => book({ index: 60, sessionId: TWICE_SESSION, mode: 'pay', otpId, formId })),
    );

    expect(twice.map((outcome) => outcome.status)).toEqual(['fulfilled', 'fulfilled']);
    const replies = twice.flatMap((outcome) =>
      outcome.status === 'fulfilled' ? [outcome.value] : [],
    );
    expect(replies.map((reply) => reply.result).sort()).toEqual(['created', 'existing']);
    expect(new Set(replies.map((reply) => reply.booking_id)).size).toBe(1);
  });

  it(
    'lets one phone hold two unpaid bookings, however many it asks for at once',
    async () => {
      const requests = await Promise.all(
        CAP_SESSIONS.map(async (sessionId) => ({
          index: 70,
          sessionId,
          mode: 'pay' as const,
          otpId: await verifiedOtp(phoneOf(70)),
        })),
      );
      const outcomes = await Promise.allSettled(requests.map((request) => book(request)));

      expect(outcomes.filter((outcome) => outcome.status === 'fulfilled')).toHaveLength(
        UNPAID_PER_PHONE,
      );
      const refusals = outcomes.flatMap((outcome) =>
        outcome.status === 'rejected' ? [String(outcome.reason)] : [],
      );
      expect(refusals).toHaveLength(CAP_SESSIONS.length - UNPAID_PER_PHONE);
      for (const refusal of refusals) expect(refusal).toContain('RATE_LIMITED');
    },
    SLOW_MS,
  );
});
