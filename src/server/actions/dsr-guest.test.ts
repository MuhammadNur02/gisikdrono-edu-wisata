import { after } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { OTP_REQUEST_MIN_RESPONSE_MS } from '@/config/guest';
import { dsrCopy } from '@/lib/copy/dsr';
import { fail } from '@/lib/errors';
import { verifyTurnstile } from '@/lib/turnstile';
import { requireGuestToken } from '@/server/auth/guards';
import { ensureOtpBrowserId, readOtpBrowserCookie } from '@/server/auth/guest-cookies';
import { guestDsr, withinGuestLimits } from '@/server/services/booking-service';

import {
  confirmDsrIdentityAction,
  downloadDsrExportAction,
  requestDsrCodeAction,
} from './dsr-guest';

vi.mock('next/headers', () => ({
  headers: () => Promise.resolve(new Headers({ 'x-real-ip': '203.0.113.7' })),
}));
vi.mock('next/server', () => ({ after: vi.fn() }));
vi.mock('@/lib/turnstile', () => ({ verifyTurnstile: vi.fn() }));
vi.mock('@/server/auth/guards', () => ({ requireGuestToken: vi.fn() }));
vi.mock('@/server/auth/guest-cookies', () => ({
  ensureOtpBrowserId: vi.fn(),
  readOtpBrowserCookie: vi.fn(),
}));
vi.mock('@/server/services/notification-service', () => ({ kickNotificationWorker: vi.fn() }));
vi.mock('@/server/services/booking-service', () => ({
  withinGuestLimits: vi.fn(),
  guestDsr: { list: vi.fn(), issueCode: vi.fn(), confirm: vi.fn(), downloadUrl: vi.fn() },
}));

const text = dsrCopy.guest;
const CODE = 'GSK-7F3K9Q2M';
const BOOKING_ID = '0192f3a4-5b6c-7d8e-9f01-0000000000bb';
const BROWSER_ID = 'b3J5Lb6Qf0x1Zr2kq9WmTA';
const GUEST = {
  ok: true as const,
  guest: { bookingId: BOOKING_ID, bookingCode: CODE, scope: 'manage' as const },
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  vi.mocked(withinGuestLimits).mockResolvedValue(true);
  vi.mocked(verifyTurnstile).mockResolvedValue(true);
  vi.mocked(requireGuestToken).mockResolvedValue(GUEST);
  vi.mocked(ensureOtpBrowserId).mockResolvedValue(BROWSER_ID);
  vi.mocked(readOtpBrowserCookie).mockResolvedValue(BROWSER_ID);
});

afterEach(() => {
  vi.useRealTimers();
});

async function requested(input: unknown) {
  const pending = requestDsrCodeAction(input);
  await vi.advanceTimersByTimeAsync(OTP_REQUEST_MIN_RESPONSE_MS);
  return pending;
}

describe('requestDsrCodeAction', () => {
  const input = { bookingCode: CODE, turnstileToken: 'turnstile-token' };

  it('sends the code to the booking of the manage link, with the booking’s own number', async () => {
    vi.mocked(guestDsr.issueCode).mockResolvedValue('sent');
    await expect(requested(input)).resolves.toEqual({ ok: true, data: null });
    expect(requireGuestToken).toHaveBeenCalledWith(CODE, 'manage');
    expect(verifyTurnstile).toHaveBeenCalledWith('turnstile-token', '203.0.113.7', 'dsr_code');
    expect(guestDsr.issueCode).toHaveBeenCalledWith({
      bookingId: BOOKING_ID,
      browserId: BROWSER_ID,
      clientIp: '203.0.113.7',
    });
    expect(after).toHaveBeenCalledOnce();
  });

  it('stops at the limiter, the security check and the link, in that order', async () => {
    vi.mocked(withinGuestLimits).mockResolvedValueOnce(false);
    await expect(requested(input)).resolves.toMatchObject({ error: { code: 'RATE_LIMITED' } });
    vi.mocked(verifyTurnstile).mockResolvedValueOnce(false);
    await expect(requested(input)).resolves.toMatchObject({
      error: { code: 'VALIDATION', message: text.captchaFailed },
    });
    vi.mocked(requireGuestToken).mockResolvedValueOnce(fail('NOT_FOUND'));
    await expect(requested(input)).resolves.toMatchObject({ error: { code: 'NOT_FOUND' } });
    expect(guestDsr.issueCode).not.toHaveBeenCalled();
  });

  it('refuses a number in the input and says when a code cannot go now', async () => {
    await expect(requested({ ...input, phone: '+6281200000000' })).resolves.toMatchObject({
      error: { code: 'VALIDATION' },
    });
    vi.mocked(guestDsr.issueCode).mockResolvedValueOnce('limited');
    await expect(requested(input)).resolves.toMatchObject({ error: { message: text.limited } });
    vi.mocked(guestDsr.issueCode).mockResolvedValueOnce('unavailable');
    await expect(requested(input)).resolves.toMatchObject({ error: { message: text.unavailable } });
    expect(after).not.toHaveBeenCalled();
  });
});

describe('confirmDsrIdentityAction', () => {
  const input = { bookingCode: CODE, code: '123456' };

  it('confirms with this browser’s code on the manage link', async () => {
    vi.mocked(guestDsr.confirm).mockResolvedValue('verified');
    await expect(confirmDsrIdentityAction(input)).resolves.toEqual({ ok: true, data: null });
    expect(requireGuestToken).toHaveBeenCalledWith(CODE, 'manage');
    expect(guestDsr.confirm).toHaveBeenCalledWith({
      bookingId: BOOKING_ID,
      browserId: BROWSER_ID,
      code: '123456',
    });
  });

  it.each([
    ['wrong_code', text.wrongCode],
    ['locked', text.lockedCode],
    ['expired', text.expiredCode],
  ] as const)('answers %s under the code field', async (checked, message) => {
    vi.mocked(guestDsr.confirm).mockResolvedValue(checked);
    await expect(confirmDsrIdentityAction(input)).resolves.toMatchObject({
      error: { code: 'VALIDATION', message, fieldErrors: { code: [message] } },
    });
  });

  it('needs the browser that asked for the code', async () => {
    vi.mocked(readOtpBrowserCookie).mockResolvedValueOnce(null);
    await expect(confirmDsrIdentityAction(input)).resolves.toMatchObject({
      error: { message: text.expiredCode },
    });
    expect(guestDsr.confirm).not.toHaveBeenCalled();
  });
});

describe('downloadDsrExportAction', () => {
  it('signs the guest’s own file on a view link, or says it is not there', async () => {
    vi.mocked(guestDsr.downloadUrl).mockResolvedValueOnce(
      'https://storage.example.test/signed/x.pdf',
    );
    await expect(downloadDsrExportAction({ bookingCode: CODE, format: 'pdf' })).resolves.toEqual({
      ok: true,
      data: { url: 'https://storage.example.test/signed/x.pdf' },
    });
    expect(requireGuestToken).toHaveBeenCalledWith(CODE, 'view');
    expect(guestDsr.downloadUrl).toHaveBeenCalledWith({
      bookingId: BOOKING_ID,
      format: 'pdf',
      fileName: `data-${CODE}.pdf`,
    });
    vi.mocked(guestDsr.downloadUrl).mockResolvedValueOnce(null);
    await expect(
      downloadDsrExportAction({ bookingCode: CODE, format: 'json' }),
    ).resolves.toMatchObject({
      error: { code: 'NOT_FOUND', message: text.downloadFailed },
    });
  });
});
