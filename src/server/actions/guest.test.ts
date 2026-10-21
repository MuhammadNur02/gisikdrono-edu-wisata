import { after } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { LOOKUP_MIN_RESPONSE_MS } from '@/config/guest';
import { fail } from '@/lib/errors';
import { verifyTurnstile } from '@/lib/turnstile';
import { requireGuestToken } from '@/server/auth/guards';
import {
  resendBookingLink,
  revokeGuestLinks,
  withinGuestLimits,
} from '@/server/services/booking-service';

import { lookupBookingAction, revokeGuestLinksAction } from './guest';

const jar = vi.hoisted(() => ({ deleted: [] as unknown[] }));

vi.mock('next/headers', () => ({
  headers: () => Promise.resolve(new Headers({ 'x-real-ip': '203.0.113.7' })),
  cookies: () => Promise.resolve({ delete: (cookie: unknown) => void jar.deleted.push(cookie) }),
}));
vi.mock('next/server', () => ({ after: vi.fn() }));
vi.mock('@/lib/turnstile', () => ({ verifyTurnstile: vi.fn() }));
vi.mock('@/server/auth/guards', () => ({ requireGuestToken: vi.fn() }));
vi.mock('@/server/services/notification-service', () => ({ kickNotificationWorker: vi.fn() }));
vi.mock('@/server/services/booking-service', () => ({
  resendBookingLink: vi.fn(),
  revokeGuestLinks: vi.fn(),
  withinGuestLimits: vi.fn(),
}));

const LOOKUP = {
  bookingCode: 'gsk 7f3k-9q2m',
  contact: '0812 3456 7890',
  turnstileToken: 'turnstile-token',
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.mocked(withinGuestLimits).mockReset().mockResolvedValue(true);
  vi.mocked(verifyTurnstile).mockReset().mockResolvedValue(true);
  vi.mocked(resendBookingLink).mockReset();
  vi.mocked(revokeGuestLinks).mockReset();
  vi.mocked(requireGuestToken).mockReset();
  vi.mocked(after).mockReset();
  jar.deleted = [];
});

afterEach(() => {
  vi.useRealTimers();
});

async function settled<T>(promise: Promise<T>): Promise<{ result: T; elapsedMs: number }> {
  const startedAt = Date.now();
  await vi.advanceTimersByTimeAsync(LOOKUP_MIN_RESPONSE_MS);
  return { result: await promise, elapsedMs: Date.now() - startedAt };
}

describe('lookupBookingAction', () => {
  it.each(['queued', 'capped', 'no_match'] as const)(
    'answers %s with the same ok, no sooner than the minimum time',
    async (outcome) => {
      vi.mocked(resendBookingLink).mockResolvedValue(outcome);
      const { result, elapsedMs } = await settled(lookupBookingAction(LOOKUP));
      expect(result).toEqual({ ok: true, data: null });
      expect(elapsedMs).toBeGreaterThanOrEqual(LOOKUP_MIN_RESPONSE_MS);
      expect(after).toHaveBeenCalledTimes(outcome === 'queued' ? 1 : 0);
    },
  );

  it('compares the code and contact in their one canonical spelling', async () => {
    vi.mocked(resendBookingLink).mockResolvedValue('no_match');
    await settled(lookupBookingAction(LOOKUP));
    expect(resendBookingLink).toHaveBeenCalledWith({
      bookingCode: 'GSK-7F3K9Q2M',
      contact: '+6281234567890',
      turnstileToken: 'turnstile-token',
    });
  });

  it('refuses over the IP limit or without a human check, before the database', async () => {
    vi.mocked(withinGuestLimits).mockResolvedValueOnce(false);
    expect(await lookupBookingAction(LOOKUP)).toMatchObject({
      ok: false,
      error: { code: 'RATE_LIMITED' },
    });
    vi.mocked(verifyTurnstile).mockResolvedValueOnce(false);
    expect(await lookupBookingAction(LOOKUP)).toMatchObject({
      ok: false,
      error: { code: 'VALIDATION' },
    });
    expect(resendBookingLink).not.toHaveBeenCalled();
  });

  it('refuses something that cannot be a code or a contact', async () => {
    expect(await lookupBookingAction({ ...LOOKUP, bookingCode: 'GSK-123' })).toMatchObject({
      ok: false,
    });
    expect(await lookupBookingAction({ ...LOOKUP, contact: 'siapa saja' })).toMatchObject({
      ok: false,
    });
  });
});

describe('revokeGuestLinksAction', () => {
  it('answers NOT_FOUND without a manage link', async () => {
    vi.mocked(requireGuestToken).mockResolvedValue(fail('NOT_FOUND'));
    expect(await revokeGuestLinksAction({ bookingCode: 'GSK-7F3K9Q2M' })).toMatchObject({
      ok: false,
      error: { code: 'NOT_FOUND' },
    });
    expect(requireGuestToken).toHaveBeenCalledWith('GSK-7F3K9Q2M', 'manage');
    expect(revokeGuestLinks).not.toHaveBeenCalled();
  });

  it('revokes every link of the booking and forgets this browser’s one', async () => {
    vi.mocked(requireGuestToken).mockResolvedValue({
      ok: true,
      guest: { bookingId: 'b-1', bookingCode: 'GSK-7F3K9Q2M', scope: 'manage' },
    });
    expect(await revokeGuestLinksAction({ bookingCode: 'GSK-7F3K9Q2M' })).toEqual({
      ok: true,
      data: null,
    });
    expect(revokeGuestLinks).toHaveBeenCalledWith('b-1');
    expect(jar.deleted).toEqual([{ name: 'bk_GSK-7F3K9Q2M', path: '/reservasi/GSK-7F3K9Q2M' }]);
  });

  it('limits revocations per booking', async () => {
    vi.mocked(requireGuestToken).mockResolvedValue({
      ok: true,
      guest: { bookingId: 'b-1', bookingCode: 'GSK-7F3K9Q2M', scope: 'manage' },
    });
    vi.mocked(withinGuestLimits).mockResolvedValueOnce(false);
    expect(await revokeGuestLinksAction({ bookingCode: 'GSK-7F3K9Q2M' })).toMatchObject({
      ok: false,
      error: { code: 'RATE_LIMITED' },
    });
    expect(await revokeGuestLinksAction({ bookingCode: 'not a code' })).toMatchObject({
      ok: false,
    });
  });
});
