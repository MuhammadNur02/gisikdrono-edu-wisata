import { createClient } from '@supabase/supabase-js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import type { Database } from '@/db/types';
import { AppError } from '@/lib/errors';
import { signTicket } from '@/lib/qr/sign';
import { attestScan } from '@/lib/scanner/attest';
import { verifyScan } from '@/server/services/gate-service';

import { sandboxEnv } from '../../../tests/fixtures/env';
import { fakeTicketToken } from '../../../tests/fixtures/ticket-token';

// What the officer's session client answers, by PostgREST path, and what it was asked.
const stage = vi.hoisted(() => ({
  replies: new Map<string, { status: number; body: unknown }>(),
  calls: [] as { path: string; query: string; body: unknown }[],
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
            stage.calls.push({ path, query: decodeURIComponent(url.search), body });
            const reply = stage.replies.get(path) ?? { status: 404, body: {} };
            return Promise.resolve(jsonReply(reply.status, reply.body));
          },
        },
      }),
    ),
}));

const KEY_RING = z.record(z.string(), z.string()).parse(JSON.parse(sandboxEnv.QR_SIGNING_KEYS));
const OFFICER_ID = '00000000-0000-4000-8000-00000000f005';
const TICKET_ID = '0192f3a4-5b6c-7d8e-9f01-0000000000aa';
const ATTEMPT_ID = '0192f3a4-5b6c-7d8e-9f01-00000000a001';
const TOKEN = signTicket({ ticketId: TICKET_ID, rwId: 5, validOn: '2026-11-12' }, 'k1', KEY_RING);
const DEVICE = { userAgent: 'Pemindai Uji', ip: '203.0.113.5' };
const NOW_MS = 1_793_000_000_000;
const EXPIRES_AT = 1_793_000_060;
const MANUAL = { bookingCode: 'GSK-7F3K9Q2M', phoneLastDigits: '4321', attemptId: ATTEMPT_ID };
const QR_PREVIEW = { token: TOKEN, attemptId: ATTEMPT_ID, mode: 'preview' } as const;
const ANSWER = {
  result: 'ok',
  ticket: null,
  used_at: null,
  used_by: null,
  checked_in_pax: null,
  unpaid_pax: null,
};

function scanCall() {
  return stage.calls.find((call) => call.path === 'rpc/scan_ticket')?.body;
}

function attestationFor(mode: 'preview' | 'commit', source: 'qr' | 'manual') {
  return attestScan(
    {
      officerId: OFFICER_ID,
      ticketId: TICKET_ID,
      attemptId: ATTEMPT_ID,
      mode,
      source,
      expiresAt: EXPIRES_AT,
    },
    sandboxEnv.CRON_SECRET,
  );
}

beforeEach(() => {
  vi.spyOn(Date, 'now').mockReturnValue(NOW_MS);
  stage.calls = [];
  stage.replies = new Map([
    ['tickets_qr', { status: 200, body: [{ id: TICKET_ID, rw_id: 5, valid_on: '2026-11-12' }] }],
    ['rpc/scan_ticket', { status: 200, body: ANSWER }],
    [
      'rpc/find_manual_ticket',
      { status: 200, body: { ticket_id: TICKET_ID, rate_limited: false } },
    ],
    ['ticket_scans', { status: 200, body: [{ ticket_id: TICKET_ID }] }],
  ]);
});

describe('verifyScan', () => {
  it('attests a genuine QR for this officer, attempt and mode, and scans it with its token', async () => {
    const outcome = await verifyScan(QR_PREVIEW, DEVICE, OFFICER_ID);

    expect(outcome).toMatchObject({
      kind: 'answered',
      response: { result: 'ok', attemptId: ATTEMPT_ID },
    });
    expect(stage.calls.map((call) => call.path)).toEqual(['tickets_qr', 'rpc/scan_ticket']);
    expect(scanCall()).toEqual({
      p_mode: 'preview',
      p_attempt_id: ATTEMPT_ID,
      p_source: 'qr',
      p_raw: TOKEN,
      p_device: { user_agent: 'Pemindai Uji', ip: '203.0.113.5' },
      p_ticket_id: TICKET_ID,
      p_attestation: attestationFor('preview', 'qr'),
      p_expires_at: EXPIRES_AT,
    });
  });

  it('attests the commit anew and sends its count and payload (review of PR #53, L4)', async () => {
    await verifyScan(
      { token: TOKEN, attemptId: ATTEMPT_ID, mode: 'commit', attendeeCount: 31 },
      { userAgent: null, ip: '203.0.113.5' },
      OFFICER_ID,
    );

    expect(scanCall()).toMatchObject({
      p_mode: 'commit',
      p_raw: TOKEN,
      p_attendee_count: 31,
      p_device: { ip: '203.0.113.5' },
      p_attestation: attestationFor('commit', 'qr'),
    });
  });

  it('attests nothing for a signature that fails, so the database records invalid_signature', async () => {
    const id = Buffer.from(TICKET_ID.replace(/-/g, ''), 'hex').toString('base64url');
    const forged = fakeTicketToken({ id });

    await verifyScan({ ...QR_PREVIEW, token: forged }, DEVICE, OFFICER_ID);

    expect(scanCall()).toMatchObject({ p_raw: forged });
    expect(scanCall()).not.toHaveProperty('p_ticket_id');
    expect(scanCall()).not.toHaveProperty('p_attestation');
  });

  it('passes a ticket the officer cannot read on unchecked, for the database to answer', async () => {
    stage.replies.set('tickets_qr', { status: 200, body: [] });

    await verifyScan(QR_PREVIEW, DEVICE, OFFICER_ID);

    expect(scanCall()).toMatchObject({ p_ticket_id: TICKET_ID });
  });

  it('answers the turn the database refused as slowed', async () => {
    stage.replies.set('rpc/scan_ticket', {
      status: 200,
      body: { slowed: true, retry_after_seconds: 5 },
    });

    await expect(verifyScan(QR_PREVIEW, DEVICE, OFFICER_ID)).resolves.toEqual({
      kind: 'slowed',
      retryAfterSeconds: 5,
    });
  });

  it('looks a manual preview up once and attests what it found, without a payload', async () => {
    await verifyScan({ ...MANUAL, mode: 'preview' }, DEVICE, OFFICER_ID);

    expect(stage.calls.find((call) => call.path === 'rpc/find_manual_ticket')?.body).toEqual({
      p_booking_code: 'GSK-7F3K9Q2M',
      p_phone_last_digits: '4321',
    });
    expect(scanCall()).toMatchObject({
      p_source: 'manual',
      p_ticket_id: TICKET_ID,
      p_attestation: attestationFor('preview', 'manual'),
    });
    expect(scanCall()).not.toHaveProperty('p_raw');
  });

  it('commits a manual check-in on the ticket its preview found, without a second lookup', async () => {
    await verifyScan({ ...MANUAL, mode: 'commit', attendeeCount: 5 }, DEVICE, OFFICER_ID);

    expect(stage.calls.map((call) => call.path)).toEqual(['ticket_scans', 'rpc/scan_ticket']);
    const read = stage.calls[0]?.query ?? '';
    expect(read).toContain(`attempt_id=eq.${ATTEMPT_ID}`);
    expect(read).toContain('phase=eq.validate');
    expect(read).toContain(`scanned_by=eq.${OFFICER_ID}`);
    expect(scanCall()).toMatchObject({
      p_ticket_id: TICKET_ID,
      p_attestation: attestationFor('commit', 'manual'),
    });
  });

  it('commits a manual check-in without a preview on no ticket at all', async () => {
    stage.replies.set('ticket_scans', { status: 200, body: [] });

    await verifyScan({ ...MANUAL, mode: 'commit', attendeeCount: 5 }, DEVICE, OFFICER_ID);

    expect(scanCall()).not.toHaveProperty('p_ticket_id');
    expect(scanCall()).not.toHaveProperty('p_attestation');
  });

  it('answers a manual lookup held by its cap as slowed, without scanning', async () => {
    stage.replies.set('rpc/find_manual_ticket', {
      status: 200,
      body: { ticket_id: null, rate_limited: true },
    });

    const outcome = await verifyScan({ ...MANUAL, mode: 'preview' }, DEVICE, OFFICER_ID);

    expect(outcome).toEqual({ kind: 'slowed', retryAfterSeconds: null });
    expect(scanCall()).toBeUndefined();
  });

  it('answers an outage a retry may get past as unavailable (review of PR #54, L3)', async () => {
    stage.replies.set('rpc/scan_ticket', {
      status: 500,
      body: { code: '08006', message: 'connection failure' },
    });

    await expect(verifyScan(QR_PREVIEW, DEVICE, OFFICER_ID)).resolves.toEqual({
      kind: 'unavailable',
    });
  });

  it.each([
    ['22023', new AppError('VALIDATION')],
    ['42501', new AppError('FORBIDDEN')],
  ])('turns the database refusing %s into an AppError', async (code, appError) => {
    stage.replies.set('rpc/scan_ticket', { status: 400, body: { code, message: 'refused' } });

    await expect(
      verifyScan(
        { token: TOKEN, attemptId: ATTEMPT_ID, mode: 'commit', attendeeCount: 900 },
        DEVICE,
        OFFICER_ID,
      ),
    ).rejects.toEqual(appError);
  });

  it('passes any other database error on unchanged', async () => {
    stage.replies.set('rpc/scan_ticket', {
      status: 409,
      body: { code: '23505', message: 'taken' },
    });

    await expect(verifyScan(QR_PREVIEW, DEVICE, OFFICER_ID)).rejects.toMatchObject({
      code: '23505',
    });
  });
});
