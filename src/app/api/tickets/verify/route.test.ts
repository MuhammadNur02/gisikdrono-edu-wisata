import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SCAN_REQUEST_BODY_LIMIT_BYTES } from '@/config/scanner';
import { AppError, fail } from '@/lib/errors';
import { requireAal2, type StaffContext } from '@/server/auth/guards';
import { verifyScan } from '@/server/services/gate-service';
import type { VerifyTicketResponse } from '@/types/scanner';

import { POST } from './route';
import { fakeTicketToken } from '../../../../../tests/fixtures/ticket-token';

vi.mock('@/server/services/gate-service', () => ({ verifyScan: vi.fn() }));
vi.mock('@/lib/supabase/admin', () => ({ createSupabaseAdminClient: vi.fn() }));
vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
  requestIdFrom: () => 'request-1',
}));
vi.mock('next/headers', () => ({ headers: () => Promise.reject(new Error('outside a request')) }));
vi.mock('@/server/auth/guards', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  requireAal2: vi.fn(),
}));

const SITE = 'http://127.0.0.1:3000';
const ATTEMPT_ID = '0192f3a4-5b6c-7d8e-9f01-00000000a001';
const OFFICER_05: StaffContext = {
  userId: '00000000-0000-4000-8000-000000000005',
  role: 'admin_rw',
  rwId: 5,
  isAal2: true,
  totpVerifiedAt: null,
  claimsVersion: 1,
};
const TOKEN = fakeTicketToken();

const ANSWER: VerifyTicketResponse = {
  result: 'ok',
  mode: 'preview',
  attemptId: ATTEMPT_ID,
  ticket: null,
  usedAt: null,
  usedBy: null,
  checkedInPax: null,
  unpaidPax: null,
};

function scanRequest(body: unknown, headers: Record<string, string> = {}) {
  return POST(
    new Request(`${SITE}/api/tickets/verify`, {
      method: 'POST',
      body: typeof body === 'string' ? body : JSON.stringify(body),
      headers: {
        'content-type': 'application/json',
        origin: SITE,
        host: '127.0.0.1:3000',
        'user-agent': 'Pemindai Uji',
        'x-real-ip': '203.0.113.5',
        ...headers,
      },
    }),
  );
}

beforeEach(() => {
  vi.mocked(requireAal2).mockReset().mockResolvedValue({ ok: true, ctx: OFFICER_05 });
  vi.mocked(verifyScan).mockReset().mockResolvedValue({ kind: 'answered', response: ANSWER });
});

describe('POST /api/tickets/verify', () => {
  it('answers a QR preview with the stable contract, uncached', async () => {
    const response = await scanRequest({ token: TOKEN, attemptId: ATTEMPT_ID, mode: 'preview' });

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(await response.json()).toEqual(ANSWER);
    expect(verifyScan).toHaveBeenCalledWith(
      { token: TOKEN, attemptId: ATTEMPT_ID, mode: 'preview' },
      { userAgent: 'Pemindai Uji', ip: '203.0.113.5' },
      OFFICER_05.userId,
    );
  });

  it('reads a manual check-in with the code as an officer typed it', async () => {
    await scanRequest({
      bookingCode: 'gsk 7f3k-9q2m',
      phoneLastDigits: '4321',
      attemptId: ATTEMPT_ID,
      mode: 'commit',
      attendeeCount: 31,
    });

    expect(verifyScan).toHaveBeenCalledWith(
      {
        bookingCode: 'GSK-7F3K9Q2M',
        phoneLastDigits: '4321',
        attemptId: ATTEMPT_ID,
        mode: 'commit',
        attendeeCount: 31,
      },
      expect.anything(),
      OFFICER_05.userId,
    );
  });

  it('refuses another origin before reading anything', async () => {
    const response = await scanRequest(
      { token: TOKEN, attemptId: ATTEMPT_ID, mode: 'preview' },
      { origin: 'https://evil.example' },
    );

    expect(response.status).toBe(403);
    expect(requireAal2).not.toHaveBeenCalled();
    expect(verifyScan).not.toHaveBeenCalled();
  });

  it('refuses a body over its cap', async () => {
    const response = await scanRequest('x'.repeat(SCAN_REQUEST_BODY_LIMIT_BYTES + 1));

    expect(response.status).toBe(413);
    expect(verifyScan).not.toHaveBeenCalled();
  });

  it.each([
    [
      'a field the contract does not name',
      { token: TOKEN, attemptId: ATTEMPT_ID, mode: 'preview', rwId: 8 },
    ],
    [
      'a payload that is no ticket',
      { token: 'https://example.com', attemptId: ATTEMPT_ID, mode: 'preview' },
    ],
    ['a commit without its count', { token: TOKEN, attemptId: ATTEMPT_ID, mode: 'commit' }],
    ['an attempt id that is no uuid', { token: TOKEN, attemptId: 'satu', mode: 'preview' }],
    [
      'a token and a code at once',
      { token: TOKEN, bookingCode: 'GSK-7F3K9Q2M', attemptId: ATTEMPT_ID, mode: 'preview' },
    ],
  ])('refuses %s', async (_case, body) => {
    const response = await scanRequest(body);

    expect(response.status).toBe(400);
    expect(verifyScan).not.toHaveBeenCalled();
  });

  it.each([
    ['without a session', 'UNAUTHENTICATED', 401],
    ['at AAL1 or without a staff role', 'FORBIDDEN', 403],
  ] as const)('refuses a request %s', async (_case, code, status) => {
    vi.mocked(requireAal2).mockResolvedValue(fail(code));

    const response = await scanRequest({ token: TOKEN, attemptId: ATTEMPT_ID, mode: 'preview' });

    expect(response.status).toBe(status);
    expect(verifyScan).not.toHaveBeenCalled();
  });

  it('answers a signed-out scanner 401 before it reads the body (review of PR #54, L2)', async () => {
    vi.mocked(requireAal2).mockResolvedValue(fail('UNAUTHENTICATED'));

    const response = await scanRequest({ token: 'bukan tiket', extra: true });

    expect(response.status).toBe(401);
  });

  it('answers an outage a retry may get past with 503, uncached (review of PR #54, L3)', async () => {
    vi.mocked(verifyScan).mockResolvedValue({ kind: 'unavailable' });

    const response = await scanRequest({ token: TOKEN, attemptId: ATTEMPT_ID, mode: 'preview' });

    expect(response.status).toBe(503);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(await response.json()).toEqual({ status: 'unavailable' });
  });

  it('slows an officer down with 429 and Retry-After', async () => {
    vi.mocked(verifyScan).mockResolvedValue({ kind: 'slowed', retryAfterSeconds: 2 });

    const response = await scanRequest({ token: TOKEN, attemptId: ATTEMPT_ID, mode: 'preview' });

    expect(response.status).toBe(429);
    expect(response.headers.get('retry-after')).toBe('2');
    expect(response.headers.get('cache-control')).toBe('private, no-store');
  });

  it('answers a manual lookup held by its cap with 429 and no Retry-After', async () => {
    vi.mocked(verifyScan).mockResolvedValue({ kind: 'slowed', retryAfterSeconds: null });

    const response = await scanRequest({
      bookingCode: 'GSK-7F3K9Q2M',
      phoneLastDigits: '4321',
      attemptId: ATTEMPT_ID,
      mode: 'preview',
    });

    expect(response.status).toBe(429);
    expect(response.headers.get('retry-after')).toBeNull();
  });

  it('answers a count the database refuses as a validation error', async () => {
    vi.mocked(verifyScan).mockRejectedValue(new AppError('VALIDATION'));

    const response = await scanRequest({
      token: TOKEN,
      attemptId: ATTEMPT_ID,
      mode: 'commit',
      attendeeCount: 900,
    });

    expect(response.status).toBe(400);
  });

  it('answers an attempt taken by another scan as a conflict, without the database text', async () => {
    vi.mocked(verifyScan).mockRejectedValue({
      code: '23505',
      message: 'attempt belongs to another scan',
    });

    const response = await scanRequest({ token: TOKEN, attemptId: ATTEMPT_ID, mode: 'preview' });

    expect(response.status).toBe(409);
    expect(JSON.stringify(await response.json())).not.toContain('attempt belongs');
  });
});
