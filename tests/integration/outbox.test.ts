import { randomUUID } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';

import { createClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import type { Database } from '@/db/types';
import type { NotificationProviders, OutgoingMessage } from '@/lib/notifications/types';
import { processNotifications } from '@/server/services/notification-service';

import { lastAuditId } from './helpers/staff-session';
import { runTag, syntheticPhone, syntheticPhonesOf } from './helpers/synthetic';
import { localStack, runSql, sqlText } from '../../scripts/local-stack';

// Two outbox workers at once, as the minute's pg_cron run and an after() kick can be (Task P5.1.02; docs/PRD.md §8.7,
// GUEST-07, CLAUDE.md §5.4). The overlap is made certain (review of PR #84, M-1): worker A claims the run's messages in
// a transaction it keeps open for a second, holding their row locks, the way a worker does between its claim and its
// commit; worker B, processNotifications itself, starts 200 ms into that second. B must claim none of A's messages,
// each message ends sent exactly once, and a later run sends none of them again. B's provider only records what it
// would send; nothing leaves this machine.
vi.mock('@/lib/supabase/admin', () => ({
  createSupabaseAdminClient: () =>
    createClient<Database>(localStack().apiUrl, localStack().serviceRoleKey, {
      auth: { persistSession: false },
    }),
}));

const RUN = runTag();
const PACKAGE_ID = randomUUID();
const SESSION_ID = randomUUID();
const HOLDS = 4;
const PAX = 2;
// Worker A's claim takes up to the most claim_notifications allows, so it holds every waiting booking_created message.
const A_CLAIM_LIMIT = 100;
const A_HOLD_SECONDS = 1;
const B_START_MS = 200;
const SLOW_MS = 120_000;

const phoneOf = (index: number) => syntheticPhone(RUN, index);

function adminClient() {
  return createClient<Database>(localStack().apiUrl, localStack().serviceRoleKey, {
    auth: { persistSession: false },
  });
}

function recordingProviders() {
  const sent: OutgoingMessage[] = [];
  const provider = {
    send: (message: OutgoingMessage) => {
      sent.push(message);
      return Promise.resolve({
        ok: true as const,
        providerMessageId: `worker-b-${message.notificationId}`,
      });
    },
  };
  const providers: NotificationProviders = { whatsapp: provider, email: provider };
  return { providers, sent };
}

async function hold(index: number): Promise<void> {
  const otpId = randomUUID();
  await runSql(`insert into public.guest_otps (id, purpose, phone, code_hash, browser_hash, expires_at, verified_at)
      values ('${otpId}', 'booking_phone', ${sqlText(phoneOf(index))}, repeat('a', 64), repeat('b', 64),
              now() + interval '5 minutes', now());
    select internal.create_booking('${PACKAGE_ID}', array['${SESSION_ID}']::uuid[], ${String(PAX)},
      jsonb_build_object('booker_type', 'individual', 'institution_name', null, 'pic_name', 'Tamu Outbox',
                         'pic_phone', ${sqlText(phoneOf(index))}, 'pic_email', 'outbox${RUN}${String(index)}@contoh.test',
                         'notes', null),
      '[]', '[]', 'pay', 'web', null, '${otpId}', '{"version": "2026-10-18"}', null,
      '{"ip": null, "user_agent": "Integration"}',
      internal.booking_quote_hash(internal.booking_quote('${PACKAGE_ID}', ${String(PAX)}, '[]', array[5]::smallint[])));`);
}

const ownRowsSchema = z.array(
  z.object({ id: z.string(), status: z.string(), provider_message_id: z.string().nullable() }),
);

async function ownMessages() {
  return ownRowsSchema.parse(
    await runSql(`select n.id::text, n.status::text, n.provider_message_id from public.notifications n
      join public.bookings b on b.id = n.booking_id where b.package_id = '${PACKAGE_ID}' order by n.id`),
  );
}

// Worker A: a claim held open for a second, then each claimed message marked sent, in one transaction.
async function workerA(): Promise<string[]> {
  const rows = z.array(z.object({ id: z.string() })).parse(
    await runSql(`create temporary table worker_a on commit drop as
        select n.id from internal.claim_notifications(${String(A_CLAIM_LIMIT)},
          array['booking_created']::public.notification_template[]) as n;
      select pg_sleep(${String(A_HOLD_SECONDS)});
      select internal.complete_notification(id, 'worker-a-' || id) from worker_a;
      select id::text from worker_a;`),
  );
  return rows.map((row) => row.id);
}

let auditIdBefore = 0;

beforeAll(async () => {
  auditIdBefore = await lastAuditId();
  await runSql(`update public.site_settings set value = 'true' where key in ('whatsapp_enabled', 'email_enabled');
    insert into public.tour_packages (id, rw_id, category, slug, name, pricing_basis, price_per_pax, status)
      values ('${PACKAGE_ID}', 5, 'regular', 'uji-outbox-${RUN}', 'Paket Uji Outbox', 'per_pax', 30000, 'published');
    insert into public.visit_sessions (id, rw_id, session_date, start_time, end_time, label, capacity)
      values ('${SESSION_ID}', 5, public.today_jkt() + 9, '13:07', '13:57', 'Uji outbox ${RUN}', 200);`);
  for (let index = 0; index < HOLDS; index += 1) await hold(index);
}, SLOW_MS);

// One query string is one transaction, so the purge and fence switches end with it.
afterAll(async () => {
  const bookings = `select id from public.bookings where package_id = '${PACKAGE_ID}'`;
  await runSql(`select set_config('app.purge', 'on', true), set_config('app.in_rpc', '1', true);
    delete from public.notifications where booking_id in (${bookings});
    delete from public.booking_events where booking_id in (${bookings});
    delete from public.booking_legs where booking_id in (${bookings});
    delete from public.guest_otps where phone like '${syntheticPhonesOf(RUN)}';
    delete from public.bookings where package_id = '${PACKAGE_ID}';
    update public.visit_sessions set reserved_pax = 0 where id = '${SESSION_ID}';
    delete from public.visit_sessions where id = '${SESSION_ID}';
    delete from public.package_price_history where package_id = '${PACKAGE_ID}';
    delete from public.tour_packages where id = '${PACKAGE_ID}';
    delete from public.audit_logs where id > ${String(auditIdBefore)};`);
}, SLOW_MS);

describe('two outbox workers at once', () => {
  it(
    'never hand one message to both, and send each message exactly once',
    async () => {
      const ownIds = (await ownMessages()).map((row) => row.id);
      expect(ownIds.length).toBeGreaterThanOrEqual(HOLDS);
      const { providers, sent } = recordingProviders();

      const claimedByA = workerA();
      await sleep(B_START_MS);
      await processNotifications(adminClient(), providers);
      const aIds = new Set(await claimedByA);

      expect(ownIds.filter((id) => !aIds.has(id))).toEqual([]);
      expect(sent.filter((message) => aIds.has(message.notificationId))).toEqual([]);
      const settled = await ownMessages();
      expect(settled.map((row) => [row.status, row.provider_message_id])).toEqual(
        settled.map((row) => ['sent', `worker-a-${row.id}`]),
      );
    },
    SLOW_MS,
  );

  it(
    'send none of them again on a later run',
    async () => {
      const ownIds = new Set((await ownMessages()).map((row) => row.id));
      const { providers, sent } = recordingProviders();
      await processNotifications(adminClient(), providers);
      expect(sent.filter((message) => ownIds.has(message.notificationId))).toEqual([]);
    },
    SLOW_MS,
  );
});
