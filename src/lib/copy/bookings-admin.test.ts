import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { BOOKING_EVENT_ACTORS } from '@/config/bookings';
import { DB_ENUMS } from '@/db/enums';
import { bookingsAdminCopy } from '@/lib/copy/bookings-admin';

// Review of PR #76, F-76-4: every machine reason a migration writes into booking_events.reason has its Indonesian
// label, so the timeline never shows a raw code. The reasons are read from the migrations themselves: the snake_case
// literals of each `insert into public.booking_events` statement, without the jsonb keys, the statuses and the actor
// types it also names. A reason built as 'payment_' || status names every attempt status it is built from.

const MIGRATIONS = path.join(process.cwd(), 'supabase', 'migrations');
const PAYMENT_PREFIX = 'payment_';
const PAYMENT_ENDINGS = ['denied', 'failed', 'cancelled', 'expired'];

function bookingEventStatements(): string[] {
  return readdirSync(MIGRATIONS)
    .filter((file) => file.endsWith('.sql'))
    .flatMap((file) => {
      const sql = readFileSync(path.join(MIGRATIONS, file), 'utf8');
      return [...sql.matchAll(/insert into public\.booking_events[\s\S]*?;/g)].map(
        (match) => match[0],
      );
    });
}

function jsonbKeysOf(statement: string): Set<string> {
  const keys = new Set<string>();
  for (const call of statement.matchAll(/jsonb_build_object\(([^()]*(?:\([^()]*\)[^()]*)*)\)/g)) {
    (call[1] ?? '').split(',').forEach((part, index) => {
      const literal = /^'([a-z_]+)'$/.exec(part.trim());
      if (index % 2 === 0 && literal?.[1]) keys.add(literal[1]);
    });
  }
  return keys;
}

function writtenReasons(): string[] {
  const notReasons = new Set<string>([...DB_ENUMS.booking_status, ...BOOKING_EVENT_ACTORS]);
  const reasons = bookingEventStatements().flatMap((statement) => {
    const keys = jsonbKeysOf(statement);
    return [...statement.matchAll(/'([a-z]+(?:_[a-z]+)*_?)'/g)]
      .map((match) => match[1] ?? '')
      .filter((literal) => !keys.has(literal) && !notReasons.has(literal));
  });
  return [...new Set(reasons)].flatMap((reason) =>
    reason === PAYMENT_PREFIX ? PAYMENT_ENDINGS.map((ending) => PAYMENT_PREFIX + ending) : [reason],
  );
}

describe('the timeline reason labels', () => {
  it('name every reason the migrations write into booking_events', () => {
    const reasons = writtenReasons();
    expect(reasons.length).toBeGreaterThan(5);
    const labelled = Object.keys(bookingsAdminCopy.detail.reasons);
    expect(reasons.filter((reason) => !labelled.includes(reason))).toEqual([]);
  });
});
