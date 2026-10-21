import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { DB_ENUMS } from '@/db/enums';

import {
  BOOKING_TRANSITIONS,
  canOpenBooking,
  canTransition,
  type BookingActor,
  type BookingStatus,
} from './booking-state';

const MIGRATIONS = fileURLToPath(new URL('../../../supabase/migrations/', import.meta.url));
const TRIGGER_FUNCTION = 'function internal.bookings_status_transition()';
const STATUSES = DB_ENUMS.booking_status;
const ACTORS: readonly BookingActor[] = ['visitor', 'webhook', 'cron', 'admin_rw', 'superadmin'];

// Migrations are forward-only, so the newest file that (re)defines the trigger function is the one in force.
function databaseTransitionPairs(): string[] {
  const definitions = readdirSync(MIGRATIONS)
    .filter((file) => file.endsWith('.sql'))
    .sort()
    .map((file) => readFileSync(`${MIGRATIONS}${file}`, 'utf8'))
    .filter((sql) => sql.includes(TRIGGER_FUNCTION));
  const sql = definitions.at(-1) ?? '';
  const body = sql.slice(sql.indexOf(TRIGGER_FUNCTION));
  const functionBody = body.slice(0, body.indexOf('$$;'));
  return [...functionBody.matchAll(/\('([a-z_]+)',\s*'([a-z_]+)'\)/g)]
    .map(([, from, to]) => `${String(from)} -> ${String(to)}`)
    .sort();
}

function mapPairs(): string[] {
  return STATUSES.flatMap((from) =>
    Object.keys(BOOKING_TRANSITIONS[from]).map((to) => `${from} -> ${to}`),
  ).sort();
}

describe('BOOKING_TRANSITIONS', () => {
  it('holds exactly the pairs internal.bookings_status_transition allows', () => {
    const pairs = databaseTransitionPairs();
    expect(pairs.length).toBeGreaterThan(0);
    expect(mapPairs()).toEqual(pairs);
  });

  it('names at least one actor for every pair it lists', () => {
    for (const from of STATUSES) {
      for (const actors of Object.values(BOOKING_TRANSITIONS[from])) {
        expect(actors.length).toBeGreaterThan(0);
      }
    }
  });
});

describe('canTransition: the rows of docs/PRD.md §9.2', () => {
  it.each<[BookingStatus, BookingStatus, BookingActor[]]>([
    ['quoted', 'pending_payment', ['visitor']],
    ['quoted', 'expired', ['cron']],
    ['quoted', 'cancelled', ['visitor', 'admin_rw', 'superadmin']],
    ['pending_payment', 'paid', ['webhook', 'cron', 'superadmin', 'admin_rw']],
    ['pending_payment', 'expired', ['cron']],
    ['pending_payment', 'cancelled', ['visitor', 'admin_rw', 'superadmin']],
    ['pending_payment', 'refunded', ['superadmin']],
    ['expired', 'paid', ['webhook', 'cron', 'superadmin']],
    ['expired', 'pending_payment', ['admin_rw', 'superadmin']],
    ['paid', 'checked_in', ['admin_rw', 'superadmin']],
    ['paid', 'no_show', ['cron']],
    ['paid', 'cancelled', ['superadmin']],
    ['paid', 'refunded', ['superadmin']],
    ['checked_in', 'completed', ['cron']],
    ['checked_in', 'refunded', ['superadmin']],
    ['checked_in', 'paid', ['superadmin']],
    ['completed', 'refunded', ['superadmin']],
    ['no_show', 'refunded', ['superadmin']],
    ['cancelled', 'refunded', ['superadmin']],
  ])('%s -> %s is for %j only', (from, to, allowed) => {
    for (const actor of ACTORS) {
      expect(canTransition(from, to, actor)).toBe(allowed.includes(actor));
    }
  });

  it('never treats staying in the same status as a transition', () => {
    for (const status of STATUSES) {
      for (const actor of ACTORS) expect(canTransition(status, status, actor)).toBe(false);
    }
  });

  it('leaves no way out of refunded and no way back into quoted', () => {
    for (const status of STATUSES) {
      for (const actor of ACTORS) {
        expect(canTransition('refunded', status, actor)).toBe(false);
        expect(canTransition(status, 'quoted', actor)).toBe(false);
      }
    }
  });

  it('lets a webhook only settle, and never cancel or refund', () => {
    const webhookTargets = STATUSES.flatMap((from) =>
      STATUSES.filter((to) => canTransition(from, to, 'webhook')).map((to) => `${from} -> ${to}`),
    );
    expect(webhookTargets).toEqual(['pending_payment -> paid', 'expired -> paid']);
  });

  it('keeps a visitor to their own unpaid booking', () => {
    const visitorTargets = STATUSES.flatMap((from) =>
      STATUSES.filter((to) => canTransition(from, to, 'visitor')).map((to) => `${from} -> ${to}`),
    );
    expect(visitorTargets).toEqual([
      'quoted -> pending_payment',
      'quoted -> cancelled',
      'pending_payment -> cancelled',
    ]);
  });
});

describe('canOpenBooking', () => {
  it('opens a quotation for a visitor, and a hold for a visitor or an officer', () => {
    expect(canOpenBooking('quoted', 'visitor')).toBe(true);
    expect(canOpenBooking('quoted', 'admin_rw')).toBe(false);
    expect(canOpenBooking('pending_payment', 'visitor')).toBe(true);
    expect(canOpenBooking('pending_payment', 'admin_rw')).toBe(true);
    expect(canOpenBooking('pending_payment', 'webhook')).toBe(false);
  });

  it('never opens a booking in any later status', () => {
    const later = STATUSES.filter((status) => status !== 'quoted' && status !== 'pending_payment');
    for (const status of later) {
      for (const actor of ACTORS) expect(canOpenBooking(status, actor)).toBe(false);
    }
  });
});
