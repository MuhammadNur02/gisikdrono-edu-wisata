import { revalidateTag } from 'next/cache';
import { after } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PHONE_PROOF_TTL_SECONDS } from '@/config/guest';
import { fail } from '@/lib/errors';
import { requireGuestToken } from '@/server/auth/guards';
import { readPhoneProofCookie } from '@/server/auth/guest-cookies';
import {
  bookingSessionDays,
  cancelGuestBooking,
  isBookingPhone,
  rescheduleGuestBooking,
  withinGuestLimits,
} from '@/server/services/booking-service';
import { startPayment } from '@/server/services/payment-service';

import { cancelBookingAction, confirmQuotationAction, rescheduleBookingAction } from './guest';

vi.mock('next/headers', () => ({ headers: vi.fn(), cookies: vi.fn() }));
vi.mock('next/server', () => ({ after: vi.fn() }));
vi.mock('next/cache', () => ({ revalidateTag: vi.fn() }));
vi.mock('@/lib/turnstile', () => ({ verifyTurnstile: vi.fn() }));
vi.mock('@/server/auth/guards', () => ({ requireGuestToken: vi.fn() }));
vi.mock('@/server/auth/guest-cookies', () => ({ readPhoneProofCookie: vi.fn() }));
vi.mock('@/server/services/notification-service', () => ({ kickNotificationWorker: vi.fn() }));
vi.mock('@/server/services/payment-service', () => ({
  settleCancellation: vi.fn(),
  startPayment: vi.fn(),
}));
vi.mock('@/server/services/booking-service', () => ({
  bookingSessionDays: vi.fn(),
  cancelGuestBooking: vi.fn(),
  flagCancellationForSuperadmin: vi.fn(),
  isBookingPhone: vi.fn(),
  rescheduleGuestBooking: vi.fn(),
  resendBookingLink: vi.fn(),
  revokeGuestLinks: vi.fn(),
  withinGuestLimits: vi.fn(),
}));

const CODE = 'GSK-7F3K9Q2M';
const SESSION = '3f1c2a6e-5b7d-4e8f-9a0b-1c2d3e4f5a6b';
const MANAGE = {
  ok: true as const,
  guest: { bookingId: 'b-1', bookingCode: CODE, scope: 'manage' as const },
};
const MS_PER_SECOND = 1000;
const STALE_SECONDS = 20 * 60;

function proofVerifiedSecondsAgo(seconds: number) {
  const verifiedAt = Math.floor(Date.now() / MS_PER_SECOND) - seconds;
  return {
    channel: 'whatsapp' as const,
    phone: '+6281234567890',
    email: null,
    otpId: 'otp-1',
    expiresAt: verifiedAt + PHONE_PROOF_TTL_SECONDS,
  };
}

beforeEach(() => {
  vi.mocked(requireGuestToken).mockReset().mockResolvedValue(MANAGE);
  vi.mocked(withinGuestLimits).mockReset().mockResolvedValue(true);
  vi.mocked(after).mockReset();
  vi.mocked(cancelGuestBooking).mockReset();
  vi.mocked(rescheduleGuestBooking).mockReset();
  vi.mocked(isBookingPhone).mockReset();
  vi.mocked(startPayment).mockReset();
  vi.mocked(readPhoneProofCookie).mockReset();
  vi.mocked(revalidateTag).mockReset();
  vi.mocked(bookingSessionDays)
    .mockReset()
    .mockResolvedValue([{ rwId: 5, sessionDate: '2026-11-20' }]);
});

// The refund the hub showed, which the action carries back for the database to compare (review of PR #69, M3).
const SHOWN = { refundAmount: 270000, refundPct: 90 };

describe('cancelBookingAction', () => {
  it('needs the manage link', async () => {
    vi.mocked(requireGuestToken).mockResolvedValue(fail('NOT_FOUND'));
    expect(
      await cancelBookingAction({ bookingCode: CODE, kind: 'cancellation', ...SHOWN }),
    ).toMatchObject({
      ok: false,
      error: { code: 'NOT_FOUND' },
    });
    expect(requireGuestToken).toHaveBeenCalledWith(CODE, 'manage');
    expect(cancelGuestBooking).not.toHaveBeenCalled();
  });

  it('cancels with the default reason and settles the refund after the answer', async () => {
    vi.mocked(cancelGuestBooking).mockResolvedValue({ closeOrders: [], refund: null });
    expect(await cancelBookingAction({ bookingCode: CODE, kind: 'weather', ...SHOWN })).toEqual({
      ok: true,
      data: null,
    });
    expect(vi.mocked(cancelGuestBooking).mock.calls[0]?.[1]).toMatchObject({
      kind: 'weather',
      expectedAmount: 270000,
      expectedPct: 90,
    });
    expect(after).toHaveBeenCalledTimes(2);
    expect(revalidateTag).toHaveBeenCalledWith('booking:b-1');
    expect(revalidateTag).toHaveBeenCalledWith('sessions:5:2026-11');
  });

  it('refuses an amount from the browser, and cancels nothing over the limit', async () => {
    const withAmount = { bookingCode: CODE, kind: 'cancellation', ...SHOWN, amount: 1 };
    expect(await cancelBookingAction(withAmount)).toMatchObject({
      error: { code: 'VALIDATION' },
    });
    vi.mocked(withinGuestLimits).mockResolvedValueOnce(false);
    expect(
      await cancelBookingAction({ bookingCode: CODE, kind: 'cancellation', ...SHOWN }),
    ).toMatchObject({
      error: { code: 'RATE_LIMITED' },
    });
    expect(cancelGuestBooking).not.toHaveBeenCalled();
  });

  it('answers PRICE_MISMATCH when the refund moved since the page was read', async () => {
    vi.mocked(cancelGuestBooking).mockRejectedValue(
      Object.assign(new Error('moved'), { code: 'P0001', hint: 'PRICE_MISMATCH' }),
    );
    expect(
      await cancelBookingAction({ bookingCode: CODE, kind: 'cancellation', ...SHOWN }),
    ).toMatchObject({
      ok: false,
      error: { code: 'PRICE_MISMATCH' },
    });
    expect(after).not.toHaveBeenCalled();
  });

  it('needs the refund the page showed', async () => {
    expect(await cancelBookingAction({ bookingCode: CODE, kind: 'cancellation' })).toMatchObject({
      error: { code: 'VALIDATION' },
    });
  });
});

describe('rescheduleBookingAction', () => {
  it('moves the booking to the sessions chosen', async () => {
    vi.mocked(rescheduleGuestBooking).mockResolvedValue({
      visitDate: '2026-11-20',
      moves: 1,
      movesLeft: 2,
    });
    expect(await rescheduleBookingAction({ bookingCode: CODE, sessionId: SESSION })).toEqual({
      ok: true,
      data: { visitDate: '2026-11-20' },
    });
    expect(rescheduleGuestBooking).toHaveBeenCalledWith('b-1', SESSION);
  });

  it('refuses a session id that is not a uuid', async () => {
    expect(await rescheduleBookingAction({ bookingCode: CODE, sessionId: '1' })).toMatchObject({
      error: { code: 'VALIDATION' },
    });
    expect(rescheduleGuestBooking).not.toHaveBeenCalled();
  });
});

describe('confirmQuotationAction', () => {
  it('starts the payment after a fresh proof of the booking phone', async () => {
    vi.mocked(readPhoneProofCookie).mockResolvedValue(proofVerifiedSecondsAgo(60));
    vi.mocked(isBookingPhone).mockResolvedValue(true);
    vi.mocked(startPayment).mockResolvedValue({ redirectUrl: 'https://snap.test/x' });
    expect(await confirmQuotationAction({ bookingCode: CODE })).toEqual({
      ok: true,
      data: { redirectUrl: 'https://snap.test/x' },
    });
    expect(isBookingPhone).toHaveBeenCalledWith('b-1', '+6281234567890');
  });

  it('refuses a stale proof, another phone or no proof at all', async () => {
    vi.mocked(readPhoneProofCookie).mockResolvedValueOnce(proofVerifiedSecondsAgo(STALE_SECONDS));
    expect(await confirmQuotationAction({ bookingCode: CODE })).toMatchObject({
      error: { code: 'VALIDATION' },
    });
    vi.mocked(readPhoneProofCookie).mockResolvedValueOnce(proofVerifiedSecondsAgo(60));
    vi.mocked(isBookingPhone).mockResolvedValueOnce(false);
    expect(await confirmQuotationAction({ bookingCode: CODE })).toMatchObject({
      error: { code: 'VALIDATION' },
    });
    vi.mocked(readPhoneProofCookie).mockResolvedValueOnce(null);
    expect(await confirmQuotationAction({ bookingCode: CODE })).toMatchObject({
      error: { code: 'VALIDATION' },
    });
    expect(startPayment).not.toHaveBeenCalled();
  });
});
