import { describe, expect, it, vi } from 'vitest';

import type { OutboxRow } from '@/db/rpc-outbox';
import type { DatabaseClient } from '@/db/rpc-result';

import { composeMessage } from './outbox-messages';

vi.mock('@/server/services/document-service', () => ({ ticketWhatsAppDocument: vi.fn() }));

// internal.enqueue_visit_reminders queues one D-1 reminder per booking and visit day, carrying the day as
// params.session_date (20261105130200); the worker words it with that day's legs only, and only legs still holding a
// seat count as a visit day (review of PR #109, L2).

const NOW = 1_790_000_000;

function leg(
  order: number,
  status: string,
  rwName: string,
  date: string,
  start: string,
  end: string,
) {
  return {
    leg_order: order,
    status,
    rw_units: { name: rwName },
    visit_sessions: { session_date: date, start_time: start, end_time: end },
  };
}

const RW05_FIRST_DAY = leg(
  1,
  'checked_in',
  'RW 05 Ecowastreme',
  '2026-11-12',
  '09:05:00',
  '10:05:00',
);
const RW13_NEXT_DAY = leg(
  2,
  'reserved',
  'RW 13 Kampung Budaya & Seni',
  '2026-11-13',
  '13:00:00',
  '14:30:00',
);

function clientWith(legs: readonly ReturnType<typeof leg>[]) {
  const booking = {
    booking_code: 'GSK-7F3K9Q2M',
    token_version: 1,
    email_verified_at: null,
    package_snapshot: { name: 'Paket Gabungan' },
    visit_date: '2026-11-12',
    pax_count: 20,
    total_amount: 600000,
    expires_at: null,
    institution_name: null,
    booking_legs: legs,
    quotations: [],
    payments: [],
  };
  const query = {
    select: () => query,
    eq: () => query,
    single: () => Promise.resolve({ data: booking, error: null }),
  };
  return { from: () => query } as unknown as DatabaseClient;
}

function reminderRow(sessionDate: string): OutboxRow {
  return {
    id: 'n-1',
    booking_id: '0192f3a4-5b6c-7d8e-9f01-23456789abcd',
    channel: 'email',
    template: 'visit_reminder_d1',
    recipient: 'ani@example.test',
    recipient_name: 'Ani',
    params: { link_scope: 'view', session_date: sessionDate },
    status: 'sending',
    attempts: 1,
    max_attempts: 8,
    dedupe_key: 'booking:x',
    document_path: null,
    next_attempt_at: '2026-10-21T00:00:00Z',
    locked_at: '2026-10-21T00:00:00Z',
    last_error_code: null,
    last_error: null,
    dead_at: null,
    provider_message_id: null,
    provider_status: null,
    sent_at: null,
    delivered_at: null,
    read_at: null,
    created_at: '2026-10-21T00:00:00Z',
    updated_at: '2026-10-21T00:00:00Z',
  };
}

async function reminderParams(legs: readonly ReturnType<typeof leg>[], sessionDate: string) {
  const composed = await composeMessage(clientWith(legs), reminderRow(sessionDate), NOW);
  if (!composed.ok) throw new Error(`refused: ${composed.failure.errorCode}`);
  return composed.message.bodyParams;
}

describe('the D-1 reminder of one visit day', () => {
  it('names that day’s session and gate only', async () => {
    expect(await reminderParams([RW13_NEXT_DAY, RW05_FIRST_DAY], '2026-11-13')).toEqual({
      name: 'Ani',
      date: 'Jumat, 13 November 2026',
      session: '13.00–14.30 WIB',
      gate: 'RW 13 Kampung Budaya & Seni',
    });
  });

  it('counts no released leg as a visit day, so its row speaks of the booking as a whole', async () => {
    const released = { ...RW13_NEXT_DAY, status: 'released' };
    expect(await reminderParams([RW05_FIRST_DAY, released], '2026-11-13')).toEqual({
      name: 'Ani',
      date: 'Kamis, 12 November 2026',
      session: 'RW 05 Ecowastreme 09.05–10.05 WIB, RW 13 Kampung Budaya & Seni 13.00–14.30 WIB',
      gate: 'RW 05 Ecowastreme',
    });
  });

  it('leaves a released leg out of a day it shares with a seat still held', async () => {
    const releasedSameDay = {
      ...RW13_NEXT_DAY,
      status: 'released',
      visit_sessions: RW05_FIRST_DAY.visit_sessions,
    };
    expect(await reminderParams([RW05_FIRST_DAY, releasedSameDay], '2026-11-12')).toMatchObject({
      session: '09.05–10.05 WIB',
      gate: 'RW 05 Ecowastreme',
    });
  });
});
