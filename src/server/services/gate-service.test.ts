import { createClient } from '@supabase/supabase-js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import type { Database } from '@/db/types';
import { AppError } from '@/lib/errors';
import { signTicket } from '@/lib/qr/sign';
import { verifyScan } from '@/server/services/gate-service';

import { sandboxEnv } from '../../../tests/fixtures/env';
import { fakeTicketToken } from '../../../tests/fixtures/ticket-token';

// What the officer's session client answers, by PostgREST path, and what it was asked.
const stage = vi.hoisted(() => ({
  replies: new Map<string, { status: number; body: unknown }>(),
  calls: [] as { path: string; body: unknown }[],
}));

function jsonReply(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: () =>
    Promise.resolve(
      createClient<Database>('http://supabase.test', 'test-key', {
        auth: { persistSession: false, autoRefreshToken: false },
        global: {
          fetch: (input, init) => {
            const url = new URL(input instanceof Request ? input.url : input.toString());
            const path = url.pathname.replace('/rest/v1/', '');
            const body: unknown = typeof init?.body === 'string' ? JSON.parse(init.body) : null;
            stage.calls.push({ path, body });
            const reply = stage.replies.get(path) ?? { status: 404, body: {} };
            return Promise.resolve(jsonReply(reply.status, reply.body));
          },
        },
      }),
    ),
}));

const KEY_RING = z.record(z.string(), z.string()).parse(JSON.parse(sandboxEnv.QR_SIGNING_KEYS));
const TICKET_ID = '0192f3a4-5b6c-7d8e-9f01-0000000000aa';
const ATTEMPT_ID = '0192f3a4-5b6c-7d8e-9f01-00000000a001';
const FACTS = { ticketId: TICKET_ID, rwId: 5, validOn: '2026-11-12' };
const TOKEN = signTicket(FACTS, 'k1', KEY_RING);
const DEVICE = { userAgent: 'Pemindai Uji', ip: '203.0.113.5' };
const TURN = { allowed: true, retry_after_seconds: null };
const ANSWER = {
  result: 'ok',
  ticket: {
    ticket_code: 'GSK-7F3K9Q2M-05',
    institution_name: 'SD Negeri Gisikdrono 01',
    pic_first_name: 'Siti',
    package_name: 'Eduwisata Ecowastreme',
    visit_date: '2026-11-12',
    session_start: '09:00:00',
    session_end: '11:00:00',
    pax_count: 30,
    participant_count: 28,
    addons: [],
  },
  used_at: null,
  used_by: null,
  checked_in_pax: null,
  unpaid_pax: null,
};

function scanCall() {
  return stage.calls.find((call) => call.path === 'rpc/scan_ticket')?.body;
}

beforeEach(() => {
  stage.calls = [];
  stage.replies = new Map([
    ['rpc/claim_scanner_turn', { status: 200, body: TURN }],
    ['tickets_qr', { status: 200, body: [{ id: TICKET_ID, rw_id: 5, valid_on: '2026-11-12' }] }],
    ['rpc/scan_ticket', { status: 200, body: ANSWER }],
  ]);
});

describe('verifyScan', () => {
  it('previews a genuine QR on the session, with the token as the payload whose hash is kept', async () => {
    const outcome = await verifyScan(
      { token: TOKEN, attemptId: ATTEMPT_ID, mode: 'preview' },
      DEVICE,
    );

    expect(outcome).toEqual({
      kind: 'answered',
      response: expect.objectContaining({
        result: 'ok',
        mode: 'preview',
        attemptId: ATTEMPT_ID,
        ticket: expect.objectContaining({
          ticketCode: 'GSK-7F3K9Q2M-05',
          picFirstName: 'Siti',
        }) as unknown,
      }) as unknown,
    });
    expect(stage.calls.map((call) => call.path)).toEqual([
      'rpc/claim_scanner_turn',
      'tickets_qr',
      'rpc/scan_ticket',
    ]);
    expect(scanCall()).toEqual({
      p_mode: 'preview',
      p_attempt_id: ATTEMPT_ID,
      p_source: 'qr',
      p_raw: TOKEN,
      p_device: { user_agent: 'Pemindai Uji', ip: '203.0.113.5' },
      p_ticket_id: TICKET_ID,
    });
  });

  it('sends the count and the payload again on the commit (review of PR #53, L4)', async () => {
    await verifyScan(
      { token: TOKEN, attemptId: ATTEMPT_ID, mode: 'commit', attendeeCount: 31 },
      DEVICE,
    );

    expect(scanCall()).toMatchObject({ p_mode: 'commit', p_raw: TOKEN, p_attendee_count: 31 });
  });

  it('passes no ticket for a signature that fails, so the database records invalid_signature', async () => {
    const forged = fakeTicketToken({
      id: Buffer.from(TICKET_ID.replace(/-/g, ''), 'hex').toString('base64url'),
    });

    await verifyScan({ token: forged, attemptId: ATTEMPT_ID, mode: 'preview' }, DEVICE);

    expect(scanCall()).toMatchObject({ p_raw: forged });
    expect(scanCall()).not.toHaveProperty('p_ticket_id');
  });

  it('passes the id of a ticket the officer cannot read unchecked, for the database to answer', async () => {
    stage.replies.set('tickets_qr', { status: 200, body: [] });

    await verifyScan({ token: TOKEN, attemptId: ATTEMPT_ID, mode: 'preview' }, DEVICE);

    expect(scanCall()).toMatchObject({ p_ticket_id: TICKET_ID });
  });

  it('stops at the turn: a slowed officer reads nothing and records nothing', async () => {
    stage.replies.set('rpc/claim_scanner_turn', {
      status: 200,
      body: { allowed: false, retry_after_seconds: 5 },
    });

    const outcome = await verifyScan(
      { token: TOKEN, attemptId: ATTEMPT_ID, mode: 'preview' },
      DEVICE,
    );

    expect(outcome).toEqual({ kind: 'slowed', retryAfterSeconds: 5 });
    expect(stage.calls.map((call) => call.path)).toEqual(['rpc/claim_scanner_turn']);
  });

  it('looks a manual check-in up and scans what it found, without a payload', async () => {
    stage.replies.set('rpc/find_manual_ticket', {
      status: 200,
      body: { ticket_id: TICKET_ID, rate_limited: false },
    });

    await verifyScan(
      {
        bookingCode: 'GSK-7F3K9Q2M',
        phoneLastDigits: '4321',
        attemptId: ATTEMPT_ID,
        mode: 'preview',
      },
      DEVICE,
    );

    expect(stage.calls.find((call) => call.path === 'rpc/find_manual_ticket')?.body).toEqual({
      p_booking_code: 'GSK-7F3K9Q2M',
      p_phone_last_digits: '4321',
    });
    expect(scanCall()).toMatchObject({ p_source: 'manual', p_ticket_id: TICKET_ID });
    expect(scanCall()).not.toHaveProperty('p_raw');
  });

  it('answers a manual lookup held by its cap as slowed, without scanning', async () => {
    stage.replies.set('rpc/find_manual_ticket', {
      status: 200,
      body: { ticket_id: null, rate_limited: true },
    });

    const outcome = await verifyScan(
      {
        bookingCode: 'GSK-7F3K9Q2M',
        phoneLastDigits: '4321',
        attemptId: ATTEMPT_ID,
        mode: 'preview',
      },
      DEVICE,
    );

    expect(outcome).toEqual({ kind: 'slowed', retryAfterSeconds: null });
    expect(scanCall()).toBeUndefined();
  });

  it.each([
    ['22023', 'VALIDATION'],
    ['42501', 'FORBIDDEN'],
  ])('turns the database refusing %s into %s', async (code, appCode) => {
    stage.replies.set('rpc/scan_ticket', { status: 400, body: { code, message: 'refused' } });

    await expect(
      verifyScan(
        { token: TOKEN, attemptId: ATTEMPT_ID, mode: 'commit', attendeeCount: 900 },
        DEVICE,
      ),
    ).rejects.toEqual(new AppError(appCode === 'VALIDATION' ? 'VALIDATION' : 'FORBIDDEN'));
  });

  it('passes any other database error on unchanged', async () => {
    stage.replies.set('rpc/scan_ticket', {
      status: 409,
      body: { code: '23505', message: 'taken' },
    });

    await expect(
      verifyScan({ token: TOKEN, attemptId: ATTEMPT_ID, mode: 'preview' }, DEVICE),
    ).rejects.toMatchObject({ code: '23505' });
  });
});
