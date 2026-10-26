import { randomInt, randomUUID } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';

import { createClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import type { Database } from '@/db/types';
import type { NotificationProviders, OutgoingMessage } from '@/lib/notifications/types';
import { processNotifications } from '@/server/services/notification-service';

import { lastAuditId } from './helpers/staff-session';
import { localStack, runSql, sqlText } from '../../scripts/local-stack';

// The outbox worker run twice at once, as the minute's pg_cron run and an after() kick do (Task P5.1.02; docs/PRD.md
// §8.7, GUEST-07, CLAUDE.md §5.4): internal.claim_notifications hands a message to one worker only, each message is
// sent once, and a later run sends none of them again. The providers record what they would send and answer after a
// moment, so the two workers overlap; nothing leaves this machine.
vi.mock('@/lib/supabase/admin', () => ({
  createSupabaseAdminClient: () =>
    createClient<Database>(localStack().apiUrl, localStack().serviceRoleKey, {
      auth: { persistSession: false },
    }),
}));

const RUN = String(randomInt(100000, 999999));
const PACKAGE_ID = randomUUID();
const SESSION_ID = randomUUID();
const HOLDS = 4;
const PAX = 2;
const SEND_DELAY_MS = 40;
const MAX_ROUNDS = 30;
const SLOW_MS = 120_000;

const phoneOf = (index: number) => `+62854${RUN}${String(index).padStart(2, '0')}`;

function adminClient() {
  return createClient<Database>(localStack().apiUrl, localStack().serviceRoleKey, {
    auth: { persistSession: false },
  });
}

function recordingProviders() {
  const sent: OutgoingMessage[] = [];
  const provider = {
    send: async (message: OutgoingMessage) => {
      sent.push(message);
      await sleep(SEND_DELAY_MS);
      return { ok: true as const, providerMessageId: `test-${message.notificationId}` };
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

const ownRowsSchema = z.array(z.object({ id: z.string(), status: z.string() }));

async function ownMessages() {
  return ownRowsSchema.parse(
    await runSql(`select n.id::text, n.status::text from public.notifications n
      join public.bookings b on b.id = n.booking_id where b.package_id = '${PACKAGE_ID}' order by n.id`),
  );
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
    delete from public.guest_otps where phone like '+62854${RUN}%';
    delete from public.bookings where package_id = '${PACKAGE_ID}';
    update public.visit_sessions set reserved_pax = 0 where id = '${SESSION_ID}';
    delete from public.visit_sessions where id = '${SESSION_ID}';
    delete from public.package_price_history where package_id = '${PACKAGE_ID}';
    delete from public.tour_packages where id = '${PACKAGE_ID}';
    delete from public.audit_logs where id > ${String(auditIdBefore)};`);
}, SLOW_MS);

describe('two outbox workers at once', () => {
  it(
    'send each message once, and a later run sends none of them again',
    async () => {
      const queued = await ownMessages();
      expect(queued.length).toBeGreaterThanOrEqual(HOLDS);
      const ownIds = new Set(queued.map((row) => row.id));
      const { providers, sent } = recordingProviders();

      for (let round = 0; round < MAX_ROUNDS; round += 1) {
        const pending = (await ownMessages()).filter(
          (row) => row.status === 'queued' || row.status === 'sending',
        );
        if (pending.length === 0) break;
        await Promise.all([
          processNotifications(adminClient(), providers),
          processNotifications(adminClient(), providers),
        ]);
      }

      const ownSends = sent
        .filter((message) => ownIds.has(message.notificationId))
        .map((message) => message.notificationId);
      expect(new Set(ownSends).size).toBe(ownSends.length);
      const settled = await ownMessages();
      expect(settled.filter((row) => row.status === 'queued' || row.status === 'sending')).toEqual(
        [],
      );
      const sentRows = settled.filter((row) => row.status === 'sent').map((row) => row.id);
      expect(sentRows.length).toBeGreaterThanOrEqual(HOLDS);
      expect([...ownSends].sort()).toEqual([...sentRows].sort());

      const before = sent.length;
      await processNotifications(adminClient(), providers);
      expect(sent.slice(before).filter((message) => ownIds.has(message.notificationId))).toEqual(
        [],
      );
    },
    SLOW_MS,
  );
});
