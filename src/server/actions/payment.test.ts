import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AppError } from '@/lib/errors';
import { requireGuestToken } from '@/server/auth/guards';
import { startPayment, withinPaymentLimits } from '@/server/services/payment-service';

import { startPaymentAction } from './payment';

vi.mock('next/headers', () => ({ headers: () => Promise.resolve(new Headers()) }));
vi.mock('@/server/auth/guards', () => ({ requireGuestToken: vi.fn() }));
vi.mock('@/server/services/payment-service', () => ({
  startPayment: vi.fn(),
  withinPaymentLimits: vi.fn(),
}));

const CODE = 'GSK-7F3K9Q2M';
const BOOKING_ID = '0192f3a4-5b6c-7d8e-9f01-0000000000bb';
const GUEST = {
  ok: true as const,
  guest: { bookingId: BOOKING_ID, bookingCode: CODE, scope: 'pay' as const, tokenVersion: 1 },
};
const NOT_FOUND = { ok: false as const, error: { code: 'NOT_FOUND' as const, message: 'x' } };
const PAGE_URL = 'https://app.sandbox.midtrans.com/snap/v4/redirection/token';

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireGuestToken).mockResolvedValue(GUEST);
  vi.mocked(withinPaymentLimits).mockResolvedValue(true);
  vi.mocked(startPayment).mockResolvedValue({ redirectUrl: PAGE_URL });
});

describe('startPaymentAction', () => {
  it('opens the booking’s Snap page for a visitor holding its pay link', async () => {
    await expect(startPaymentAction({ bookingCode: CODE })).resolves.toEqual({
      ok: true,
      data: { redirectUrl: PAGE_URL },
    });
    expect(requireGuestToken).toHaveBeenCalledWith(CODE, 'pay');
    expect(withinPaymentLimits).toHaveBeenCalledWith([
      { name: 'payment_start:booking', subject: BOOKING_ID },
    ]);
    expect(startPayment).toHaveBeenCalledWith(BOOKING_ID);
  });

  it('takes the booking code only: an amount or anything else is refused (PAY-03)', async () => {
    const result = await startPaymentAction({ bookingCode: CODE, grossAmount: 1 });
    expect(result).toMatchObject({ ok: false, error: { code: 'VALIDATION' } });
    expect(requireGuestToken).not.toHaveBeenCalled();
  });

  it('answers a visitor without the link the same 404', async () => {
    vi.mocked(requireGuestToken).mockResolvedValue(NOT_FOUND);
    await expect(startPaymentAction({ bookingCode: CODE })).resolves.toEqual(NOT_FOUND);
    expect(startPayment).not.toHaveBeenCalled();
  });

  it('stops a booking that asked for too many pages', async () => {
    vi.mocked(withinPaymentLimits).mockResolvedValue(false);
    await expect(startPaymentAction({ bookingCode: CODE })).resolves.toMatchObject({
      ok: false,
      error: { code: 'RATE_LIMITED' },
    });
    expect(startPayment).not.toHaveBeenCalled();
  });

  it('answers a refusal in the visitor’s own words', async () => {
    vi.mocked(startPayment).mockRejectedValue(new AppError('STATE_INVALID', 'Sudah lewat.'));
    await expect(startPaymentAction({ bookingCode: CODE })).resolves.toEqual({
      ok: false,
      error: { code: 'STATE_INVALID', message: 'Sudah lewat.' },
    });
  });
});
