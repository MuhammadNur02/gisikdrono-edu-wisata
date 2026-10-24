import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { signTicket } from '@/lib/qr/sign';
import { withinRateLimits } from '@/lib/rate-limit';
import { getTicketsForBooking, readTicketLanding } from '@/server/services/ticket-service';

import { sandboxEnv } from '../../../tests/fixtures/env';

// What the mocked client answers: the booking's ticket rows, and the one row a landing token names.
const rows: { tickets: unknown[]; landing: unknown } = vi.hoisted(() => ({
  tickets: [],
  landing: null,
}));
vi.mock('@/lib/supabase/admin', () => ({
  createSupabaseAdminClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          order: () => Promise.resolve({ data: rows.tickets, error: null }),
          maybeSingle: () => Promise.resolve({ data: rows.landing, error: null }),
        }),
      }),
    }),
  }),
}));
vi.mock('@/lib/rate-limit', () => ({ withinRateLimits: vi.fn() }));

const KEY_RING = z.record(z.string(), z.string()).parse(JSON.parse(sandboxEnv.QR_SIGNING_KEYS));
const TICKET_ID = '0192f3a4-5b6c-7d8e-9f01-0000000000aa';
const TICKET_ROW = {
  id: TICKET_ID,
  ticket_code: 'GSK-7F3K9Q2M-05',
  rw_id: 5,
  valid_on: '2026-11-12',
  pax_count: 20,
  status: 'issued',
  key_id: 'k1',
  rw_units: { name: 'RW 05 Ecowastreme' },
  visit_sessions: { start_time: '09:05:00', end_time: '10:05:00' },
};
const TOKEN = signTicket({ ticketId: TICKET_ID, rwId: 5, validOn: '2026-11-12' }, 'k1', KEY_RING);

beforeEach(() => {
  vi.clearAllMocks();
  rows.tickets = [TICKET_ROW];
  rows.landing = { ...TICKET_ROW };
  vi.mocked(withinRateLimits).mockResolvedValue(true);
});

describe('getTicketsForBooking', () => {
  it('gives each leg its ticket with the QR of its own landing address, signed with the row’s kid', async () => {
    const [ticket] = await getTicketsForBooking('0192f3a4-5b6c-7d8e-9f01-0000000000bb');
    expect(ticket).toMatchObject({
      ticketCode: 'GSK-7F3K9Q2M-05',
      rwName: 'RW 05 Ecowastreme',
      validOn: '2026-11-12',
      startTime: '09:05:00',
      endTime: '10:05:00',
      paxCount: 20,
      status: 'issued',
    });
    expect(ticket?.qr?.size).toBeGreaterThan(20);
    expect(ticket?.qr?.path).toMatch(/^M\d+ \d+h/);
  });

  it('draws no QR for a ticket whose kid has retired', async () => {
    rows.tickets = [{ ...TICKET_ROW, key_id: 'retired' }];
    const [ticket] = await getTicketsForBooking('0192f3a4-5b6c-7d8e-9f01-0000000000bb');
    expect(ticket?.qr).toBeNull();
  });
});

describe('readTicketLanding', () => {
  it('says valid with the RW and the day, and nothing else, for a signed ticket', async () => {
    await expect(readTicketLanding(TOKEN, '203.0.113.7')).resolves.toEqual({
      kind: 'valid',
      rwName: 'RW 05 Ecowastreme',
      validOn: '2026-11-12',
    });
    expect(withinRateLimits).toHaveBeenCalledWith(expect.anything(), [
      { name: 'qr_landing:ip', subject: '203.0.113.7' },
    ]);
  });

  it('keeps a used ticket valid, so the landing never tells whether a group has checked in', async () => {
    rows.landing = { ...TICKET_ROW, status: 'used' };
    await expect(readTicketLanding(TOKEN, '203.0.113.7')).resolves.toMatchObject({ kind: 'valid' });
  });

  it('says not valid for a forged token, an unknown ticket, another day or a revoked ticket', async () => {
    const forged = `${TOKEN.slice(0, -4)}AAAA`;
    await expect(readTicketLanding(forged, '203.0.113.7')).resolves.toEqual({ kind: 'invalid' });
    await expect(readTicketLanding('not-a-token', '203.0.113.7')).resolves.toEqual({
      kind: 'invalid',
    });
    rows.landing = { ...TICKET_ROW, valid_on: '2026-11-13' };
    await expect(readTicketLanding(TOKEN, '203.0.113.7')).resolves.toEqual({ kind: 'invalid' });
    rows.landing = { ...TICKET_ROW, status: 'revoked' };
    await expect(readTicketLanding(TOKEN, '203.0.113.7')).resolves.toEqual({ kind: 'invalid' });
    rows.landing = null;
    await expect(readTicketLanding(TOKEN, '203.0.113.7')).resolves.toEqual({ kind: 'invalid' });
  });

  it('stops a visitor who checks too many tokens', async () => {
    vi.mocked(withinRateLimits).mockResolvedValue(false);
    await expect(readTicketLanding(TOKEN, '203.0.113.7')).resolves.toEqual({
      kind: 'rate_limited',
    });
  });
});
