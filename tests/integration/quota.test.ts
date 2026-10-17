import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';

import { runSql } from '../../scripts/local-stack';

// Fifty visitors race for the last ten seats of a session (Task P1.9.04, docs/Security.md BOOK-01). Each call is
// its own transaction on its own connection, and a call that gets a seat keeps the session row locked for a moment,
// so the others queue on the lock and must re-check the room that is left once it is released. The suite removes
// its session and the audit rows it caused, so the pgTAP suites meet the database as the seed left it.

const SESSION_ID = '00000000-0000-4000-9000-0000000004a1';
const CAPACITY = 10;
const PARALLEL_CALLS = 50;
const SLOW_TEST_MS = 60_000;

const idRowsSchema = z.array(z.object({ id: z.coerce.number() }));
const reservedRowsSchema = z.array(z.object({ reserved_pax: z.number() }));

async function lastAuditId(): Promise<number> {
  const rows = await runSql('select coalesce(max(id), 0) as id from public.audit_logs');
  return idRowsSchema.parse(rows)[0]?.id ?? 0;
}

function reserveOneSeat(): Promise<unknown[]> {
  return runSql(`select internal.reserve_session_quota('${SESSION_ID}', 1);
                 select pg_sleep(0.2);`);
}

describe('fifty parallel reservations for a session of ten', () => {
  let auditIdBefore = 0;

  beforeAll(async () => {
    auditIdBefore = await lastAuditId();
    await runSql(`insert into public.visit_sessions (id, rw_id, session_date, start_time, end_time, label, capacity)
                  values ('${SESSION_ID}', 5, public.today_jkt() + 60, '05:31', '06:00', 'Uji Paralel',
                          ${String(CAPACITY)})`);
  });

  // One query string is one transaction, so the fence and purge switches end with it.
  afterAll(async () => {
    await runSql(`select set_config('app.in_rpc', '1', true), set_config('app.purge', 'on', true);
      update public.visit_sessions set reserved_pax = 0 where id = '${SESSION_ID}';
      delete from public.visit_sessions where id = '${SESSION_ID}';
      delete from public.audit_logs where id > ${String(auditIdBefore)};`);
  }, SLOW_TEST_MS);

  it(
    'lets exactly ten through and leaves reserved_pax at capacity',
    async () => {
      const outcomes = await Promise.allSettled(
        Array.from({ length: PARALLEL_CALLS }, () => reserveOneSeat()),
      );

      const refusals = outcomes.filter((outcome) => outcome.status === 'rejected');
      expect(outcomes.length - refusals.length).toBe(CAPACITY);
      for (const refusal of refusals) {
        expect(String(refusal.reason)).toContain('has no room');
      }

      const rows = await runSql(
        `select reserved_pax from public.visit_sessions where id = '${SESSION_ID}'`,
      );
      expect(reservedRowsSchema.parse(rows)).toEqual([{ reserved_pax: CAPACITY }]);
    },
    SLOW_TEST_MS,
  );
});
