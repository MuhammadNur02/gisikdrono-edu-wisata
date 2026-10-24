import { describe, expect, it } from 'vitest';
import { ZodError } from 'zod';

import { claimScannerTurn, findManualTicket, scanTicket } from '@/db/rpc-scanner';

import { clientAnswering } from '../../tests/fixtures/postgrest-client';

const ATTEMPT_ID = '0192f3a4-5b6c-7d8e-9f01-00000000a001';
const TICKET_ID = '0192f3a4-5b6c-7d8e-9f01-0000000000aa';

describe('claimScannerTurn', () => {
  it('reads the turn and how long a slowed officer waits', async () => {
    const { client, requests } = clientAnswering(200, { allowed: false, retry_after_seconds: 2 });
    await expect(claimScannerTurn(client)).resolves.toEqual({
      allowed: false,
      retryAfterSeconds: 2,
    });
    expect(requests[0]?.url).toBe('http://supabase.test/rest/v1/rpc/claim_scanner_turn');
  });

  it('refuses a reply of another shape', async () => {
    const { client } = clientAnswering(200, { allowed: 'yes' });
    await expect(claimScannerTurn(client)).rejects.toBeInstanceOf(ZodError);
  });
});

describe('findManualTicket', () => {
  it('sends the code and the digits and reads the ticket and the cap', async () => {
    const { client, requests } = clientAnswering(200, {
      ticket_id: TICKET_ID,
      rate_limited: false,
    });
    await expect(
      findManualTicket(client, { bookingCode: 'GSK-7F3K9Q2M', phoneLastDigits: '4321' }),
    ).resolves.toEqual({ ticketId: TICKET_ID, rateLimited: false });
    expect(requests[0]?.body).toEqual({
      p_booking_code: 'GSK-7F3K9Q2M',
      p_phone_last_digits: '4321',
    });
  });
});

describe('scanTicket', () => {
  const USED = {
    result: 'already_used',
    ticket: {
      ticket_code: 'GSK-7F3K9Q2M-05',
      institution_name: null,
      pic_first_name: 'Siti',
      package_name: null,
      visit_date: '2026-11-12',
      session_start: '09:00:00',
      session_end: '11:00:00',
      pax_count: 30,
      participant_count: 0,
      addons: [{ name: 'Kompos 1 kg', quantity: 2 }],
    },
    used_at: '2026-11-12T09:05:00+07:00',
    used_by: 'Budi',
    checked_in_pax: 31,
    unpaid_pax: 1,
  };

  it('maps the database answer onto the stable contract, with the mode and attempt it was for', async () => {
    const { client, requests } = clientAnswering(200, USED);
    const answer = await scanTicket(client, {
      mode: 'preview',
      attemptId: ATTEMPT_ID,
      source: 'qr',
      raw: 'GSK.k1.x',
      device: {},
      ticketId: TICKET_ID,
      attendeeCount: null,
      overrideReason: null,
    });
    expect(answer).toEqual({
      result: 'already_used',
      mode: 'preview',
      attemptId: ATTEMPT_ID,
      ticket: {
        ticketCode: 'GSK-7F3K9Q2M-05',
        institutionName: null,
        picFirstName: 'Siti',
        packageName: '',
        visitDate: '2026-11-12',
        sessionStart: '09:00:00',
        sessionEnd: '11:00:00',
        paxCount: 30,
        participantCount: 0,
        addons: [{ name: 'Kompos 1 kg', quantity: 2 }],
      },
      usedAt: '2026-11-12T09:05:00+07:00',
      usedBy: 'Budi',
      checkedInPax: 31,
      unpaidPax: 1,
    });
    expect(requests[0]?.body).toEqual({
      p_mode: 'preview',
      p_attempt_id: ATTEMPT_ID,
      p_source: 'qr',
      p_raw: 'GSK.k1.x',
      p_device: {},
      p_ticket_id: TICKET_ID,
    });
  });

  it('leaves out what a scan does not have, so the database defaults it to null', async () => {
    const { client, requests } = clientAnswering(200, {
      ...USED,
      result: 'not_found',
      ticket: null,
    });
    await scanTicket(client, {
      mode: 'commit',
      attemptId: ATTEMPT_ID,
      source: 'manual',
      raw: null,
      device: {},
      ticketId: null,
      attendeeCount: 5,
      overrideReason: 'Rombongan datang lebih awal',
    });
    expect(requests[0]?.body).toEqual({
      p_mode: 'commit',
      p_attempt_id: ATTEMPT_ID,
      p_source: 'manual',
      p_device: {},
      p_attendee_count: 5,
      p_override_reason: 'Rombongan datang lebih awal',
    });
  });

  it('refuses a result the contract does not know', async () => {
    const { client } = clientAnswering(200, { ...USED, result: 'maybe' });
    await expect(
      scanTicket(client, {
        mode: 'preview',
        attemptId: ATTEMPT_ID,
        source: 'qr',
        raw: 'GSK.k1.x',
        device: {},
        ticketId: null,
        attendeeCount: null,
        overrideReason: null,
      }),
    ).rejects.toBeInstanceOf(ZodError);
  });
});
