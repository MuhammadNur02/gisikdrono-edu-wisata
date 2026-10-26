import { randomInt, randomUUID } from 'node:crypto';

import { createClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { POST as anomalyScan } from '@/app/api/jobs/anomaly-scan/route';
import type { Database } from '@/db/types';
import { serverEnv } from '@/lib/env';

import { lastAuditId } from './helpers/staff-session';
import { localStack, runSql, sqlText } from '../../scripts/local-stack';

// The anomaly scan of POST /api/jobs/anomaly-scan against fixtures in the real tables (Task P5.1.02; docs/Security.md
// §11.2, MON-04): a hold left past its deadline, a session whose seats are 80 % held by unpaid bookings, and a very
// large group each raise their alert; a second run sees them again on the same open alert instead of a new one; and
// the job refuses a call without CRON_SECRET.
vi.mock('@/lib/supabase/admin', () => ({
  createSupabaseAdminClient: () =>
    createClient<Database>(localStack().apiUrl, localStack().serviceRoleKey, {
      auth: { persistSession: false },
    }),
}));

const RUN = String(randomInt(100000, 999999));
const PACKAGE_ID = randomUUID();
const SESSIONS = { stale: randomUUID(), held: randomUUID(), large: randomUUID() };
const HELD_PAX = 5;
const HELD_CAPACITY_AFTER = 6;
const LARGE_PAX = 150;
const SLOW_MS = 120_000;

const phoneOf = (index: number) => `+62853${RUN}${String(index).padStart(2, '0')}`;

async function hold(index: number, sessionId: string, pax: number): Promise<string> {
  const otpId = randomUUID();
  const rows = z.array(z.object({ id: z.string() })).parse(
    await runSql(`insert into public.guest_otps (id, purpose, phone, code_hash, browser_hash, expires_at, verified_at)
        values ('${otpId}', 'booking_phone', ${sqlText(phoneOf(index))}, repeat('a', 64), repeat('b', 64),
                now() + interval '5 minutes', now());
      select internal.create_booking('${PACKAGE_ID}', array['${sessionId}']::uuid[], ${String(pax)},
        jsonb_build_object('booker_type', 'school', 'institution_name', 'SD Negeri Anomali', 'pic_name', 'Ani Anomali',
                           'pic_phone', ${sqlText(phoneOf(index))}, 'pic_email', 'anomali${RUN}${String(index)}@contoh.test',
                           'notes', null),
        '[]', '[]', 'pay', 'web', null, '${otpId}', '{"version": "2026-10-18"}', null,
        '{"ip": null, "user_agent": "Integration"}',
        internal.booking_quote_hash(internal.booking_quote('${PACKAGE_ID}', ${String(pax)}, '[]', array[5]::smallint[])))
        ->> 'booking_id' as id;`),
  );
  const id = rows[0]?.id;
  if (!id) throw new Error('no hold was made');
  return id;
}

function scanRequest(authorization: string | null): Request {
  return new Request('http://localhost/api/jobs/anomaly-scan', {
    method: 'POST',
    headers: authorization ? { authorization } : {},
  });
}

const alertSchema = z.array(
  z.object({ fingerprint: z.string(), occurrences: z.number(), severity: z.string() }),
);

async function openAlerts(fingerprints: string[]) {
  return alertSchema.parse(
    await runSql(`select fingerprint, occurrences, severity::text from public.security_alerts
      where acknowledged_at is null and fingerprint in (${fingerprints.map(sqlText).join(', ')})
      order by fingerprint`),
  );
}

const ids = { stale: '', held: '', large: '' };
let fingerprints: string[] = [];
let auditIdBefore = 0;

beforeAll(async () => {
  auditIdBefore = await lastAuditId();
  await runSql(`insert into public.tour_packages (id, rw_id, category, slug, name, pricing_basis, price_per_pax, status)
      values ('${PACKAGE_ID}', 5, 'regular', 'uji-anomali-${RUN}', 'Paket Uji Anomali', 'per_pax', 30000, 'published');
    insert into public.visit_sessions (id, rw_id, session_date, start_time, end_time, label, capacity) values
      ('${SESSIONS.stale}', 5, public.today_jkt() + 10, '07:13', '08:03', 'Uji anomali ${RUN} a', 200),
      ('${SESSIONS.held}', 5, public.today_jkt() + 10, '08:13', '09:03', 'Uji anomali ${RUN} b', ${String(2 * HELD_PAX)}),
      ('${SESSIONS.large}', 5, public.today_jkt() + 10, '09:13', '10:03', 'Uji anomali ${RUN} c', 400);`);
  ids.stale = await hold(1, SESSIONS.stale, 2);
  ids.held = await hold(2, SESSIONS.held, HELD_PAX);
  ids.large = await hold(3, SESSIONS.large, LARGE_PAX);
  // The hold past its deadline (and past the expiry job's grace), and the session made smaller once half of it was
  // held unpaid, so its unpaid share reaches 5 of 6.
  await runSql(`select set_config('app.hold_extension', '1', true);
    update public.bookings set expires_at = now() - interval '20 minutes' where id = '${ids.stale}';`);
  await runSql(
    `update public.visit_sessions set capacity = ${String(HELD_CAPACITY_AFTER)} where id = '${SESSIONS.held}'`,
  );
  fingerprints = [
    'hold_past_ttl:-',
    `session_held_unpaid:${SESSIONS.held}`,
    `large_booking:${ids.large}`,
  ];
}, SLOW_MS);

// One query string is one transaction, so the purge and fence switches end with it.
afterAll(async () => {
  const bookings = `select id from public.bookings where package_id = '${PACKAGE_ID}'`;
  const sessions = Object.values(SESSIONS)
    .map((id) => `'${id}'`)
    .join(', ');
  await runSql(`select set_config('app.purge', 'on', true), set_config('app.in_rpc', '1', true);
    delete from public.security_alerts where fingerprint in (${fingerprints.map(sqlText).join(', ')})
      or fingerprint = ${sqlText(`large_group:${ids.large}`)};
    delete from public.notifications where booking_id in (${bookings});
    delete from public.booking_events where booking_id in (${bookings});
    delete from public.booking_legs where booking_id in (${bookings});
    delete from public.guest_otps where phone like '+62853${RUN}%';
    delete from public.bookings where package_id = '${PACKAGE_ID}';
    update public.visit_sessions set reserved_pax = 0 where id in (${sessions});
    delete from public.visit_sessions where id in (${sessions});
    delete from public.package_price_history where package_id = '${PACKAGE_ID}';
    delete from public.tour_packages where id = '${PACKAGE_ID}';
    delete from public.audit_logs where id > ${String(auditIdBefore)};`);
}, SLOW_MS);

describe('the anomaly scan job', () => {
  it('refuses a call without the cron secret', async () => {
    expect((await anomalyScan(scanRequest(null))).status).toBe(401);
    expect((await anomalyScan(scanRequest('Bearer not-the-secret'))).status).toBe(401);
  });

  it(
    'raises an alert for a stale hold, a session held unpaid and a very large group',
    async () => {
      const response = await anomalyScan(scanRequest(`Bearer ${serverEnv.CRON_SECRET}`));
      expect(response.status).toBe(200);

      const alerts = await openAlerts(fingerprints);
      expect(alerts.map((alert) => alert.fingerprint)).toEqual([...fingerprints].sort());
      for (const alert of alerts) expect(alert.severity).toBe('medium');
    },
    SLOW_MS,
  );

  it(
    'sees them again on the same open alert when it runs again',
    async () => {
      const before = await openAlerts(fingerprints);
      expect((await anomalyScan(scanRequest(`Bearer ${serverEnv.CRON_SECRET}`))).status).toBe(200);
      const after = await openAlerts(fingerprints);

      expect(after.map((alert) => alert.fingerprint)).toEqual(
        before.map((alert) => alert.fingerprint),
      );
      after.forEach((alert, index) => {
        expect(alert.occurrences).toBe((before[index]?.occurrences ?? 0) + 1);
      });
    },
    SLOW_MS,
  );
});
