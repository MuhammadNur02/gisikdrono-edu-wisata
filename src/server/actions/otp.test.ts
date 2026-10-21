import { after } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { OTP_REQUEST_MIN_RESPONSE_MS } from '@/config/guest';
import { copy } from '@/lib/copy/id';
import { verifyTurnstile } from '@/lib/turnstile';
import {
  ensureOtpBrowserId,
  readOtpBrowserCookie,
  rememberPhoneProof,
} from '@/server/auth/guest-cookies';
import {
  issuePhoneOtp,
  verifyPhoneOtp,
  withinGuestLimits,
} from '@/server/services/booking-service';

import { requestPhoneOtpAction, verifyPhoneOtpAction } from './otp';

vi.mock('next/headers', () => ({
  headers: () => Promise.resolve(new Headers({ 'x-real-ip': '203.0.113.7' })),
}));
vi.mock('next/server', () => ({ after: vi.fn() }));
vi.mock('@/lib/turnstile', () => ({ verifyTurnstile: vi.fn() }));
vi.mock('@/server/auth/guest-cookies', () => ({
  ensureOtpBrowserId: vi.fn(),
  readOtpBrowserCookie: vi.fn(),
  rememberPhoneProof: vi.fn(),
}));
vi.mock('@/server/services/notification-service', () => ({ kickNotificationWorker: vi.fn() }));
vi.mock('@/server/services/booking-service', () => ({
  issuePhoneOtp: vi.fn(),
  verifyPhoneOtp: vi.fn(),
  withinGuestLimits: vi.fn(),
}));

const text = copy.booking.otp;
const OTP_ID = '0192f3a4-5b6c-7d8e-9f01-0000000000aa';
const BROWSER_ID = 'b3J5Lb6Qf0x1Zr2kq9WmTA';
const REQUEST = { phone: '0812-3456-7890', turnstileToken: 'turnstile-token' };
const REQUESTED = { status: 'requested', channel: 'whatsapp', resendAfterSeconds: 60 };

beforeEach(() => {
  vi.useFakeTimers();
  vi.mocked(withinGuestLimits).mockReset().mockResolvedValue(true);
  vi.mocked(verifyTurnstile).mockReset().mockResolvedValue(true);
  vi.mocked(ensureOtpBrowserId).mockReset().mockResolvedValue(BROWSER_ID);
  vi.mocked(readOtpBrowserCookie).mockReset().mockResolvedValue(BROWSER_ID);
  vi.mocked(issuePhoneOtp).mockReset();
  vi.mocked(verifyPhoneOtp).mockReset();
  vi.mocked(rememberPhoneProof).mockReset();
  vi.mocked(after).mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

async function settled<T>(promise: Promise<T>): Promise<{ result: T; elapsedMs: number }> {
  const startedAt = Date.now();
  await vi.advanceTimersByTimeAsync(OTP_REQUEST_MIN_RESPONSE_MS);
  return { result: await promise, elapsedMs: Date.now() - startedAt };
}

describe('requestPhoneOtpAction', () => {
  it('issues a WhatsApp code to this browser for the normalised number and sends it at once', async () => {
    vi.mocked(issuePhoneOtp).mockResolvedValue({ status: 'sent', otpId: OTP_ID, expiresAt: 'x' });
    const { result } = await settled(requestPhoneOtpAction(REQUEST));
    expect(result).toEqual({ ok: true, data: REQUESTED });
    expect(issuePhoneOtp).toHaveBeenCalledWith({
      channel: 'whatsapp',
      phone: '+6281234567890',
      email: null,
      clientIp: '203.0.113.7',
      browserId: BROWSER_ID,
    });
    expect(verifyTurnstile).toHaveBeenCalledWith('turnstile-token', '203.0.113.7', 'otp_request');
    expect(after).toHaveBeenCalledTimes(1);
  });

  // Review of PR #20, L4: whether a number is waiting out its minute or has used its codes says that someone asked
  // for it, so the visitor hears the same as for a code on its way, no sooner.
  it.each([
    { status: 'sent', otpId: OTP_ID, expiresAt: 'x' } as const,
    { status: 'cooldown', retryAfterSeconds: 42 } as const,
    { status: 'limited' } as const,
  ])('answers %j with the same words, no sooner than the minimum time', async (issued) => {
    vi.mocked(issuePhoneOtp).mockResolvedValue(issued);
    const { result, elapsedMs } = await settled(requestPhoneOtpAction(REQUEST));
    expect(result).toEqual({ ok: true, data: REQUESTED });
    expect(elapsedMs).toBeGreaterThanOrEqual(OTP_REQUEST_MIN_RESPONSE_MS);
    expect(after).toHaveBeenCalledTimes(issued.status === 'sent' ? 1 : 0);
  });

  it('checks the email fallback against its own Turnstile action', async () => {
    vi.mocked(issuePhoneOtp).mockResolvedValue({ status: 'sent', otpId: OTP_ID, expiresAt: 'x' });
    const email = { ...REQUEST, channel: 'email', email: 'Ani@Example.test' };
    const { result } = await settled(requestPhoneOtpAction(email));
    expect(result).toEqual({ ok: true, data: { ...REQUESTED, channel: 'email' } });
    expect(verifyTurnstile).toHaveBeenCalledWith('turnstile-token', '203.0.113.7', 'otp_email');
    expect(vi.mocked(issuePhoneOtp).mock.calls[0]?.[0].email).toBe('ani@example.test');
  });

  it('switches the form to email when WhatsApp is limited, sending nothing', async () => {
    vi.mocked(issuePhoneOtp).mockResolvedValue({ status: 'degraded' });
    const { result } = await settled(requestPhoneOtpAction(REQUEST));
    expect(result).toEqual({ ok: true, data: { status: 'degraded' } });
    expect(after).not.toHaveBeenCalled();
  });

  it('explains that an email code is only for when WhatsApp is limited', async () => {
    vi.mocked(issuePhoneOtp).mockResolvedValue({ status: 'unavailable' });
    const { result } = await settled(requestPhoneOtpAction(REQUEST));
    expect(result).toEqual({ ok: false, error: { code: 'VALIDATION', message: text.unavailable } });
  });

  it('refuses before the database over the IP limit or without a human check', async () => {
    vi.mocked(withinGuestLimits).mockResolvedValueOnce(false);
    expect((await settled(requestPhoneOtpAction(REQUEST))).result.ok).toBe(false);
    vi.mocked(verifyTurnstile).mockResolvedValueOnce(false);
    const { result } = await settled(requestPhoneOtpAction(REQUEST));
    expect(result).toMatchObject({
      ok: false,
      error: { fieldErrors: { turnstileToken: [text.captchaFailed] } },
    });
    expect(issuePhoneOtp).not.toHaveBeenCalled();
  });

  it('refuses a landline, a foreign number and an email request without an address', async () => {
    for (const input of [
      { ...REQUEST, phone: '024 7612345' },
      { ...REQUEST, phone: '+60 12 345 6789' },
      { ...REQUEST, channel: 'email' },
    ]) {
      expect((await settled(requestPhoneOtpAction(input))).result).toMatchObject({
        ok: false,
        error: { code: 'VALIDATION' },
      });
    }
    expect(issuePhoneOtp).not.toHaveBeenCalled();
  });
});

describe('verifyPhoneOtpAction', () => {
  const CHECK = { code: '482913', phone: '0812-3456-7890' };
  const VERIFIED = {
    status: 'verified',
    otpId: OTP_ID,
    purpose: 'booking_phone',
    phone: '+6281111111111',
    email: null,
  } as const;

  it('checks the code this browser holds and remembers the number the database verified', async () => {
    vi.mocked(verifyPhoneOtp).mockResolvedValue(VERIFIED);
    await expect(verifyPhoneOtpAction(CHECK)).resolves.toEqual({
      ok: true,
      data: { channel: 'whatsapp' },
    });
    expect(verifyPhoneOtp).toHaveBeenCalledWith({
      channel: 'whatsapp',
      phone: '+6281234567890',
      email: null,
      code: '482913',
      browserId: BROWSER_ID,
    });
    expect(rememberPhoneProof).toHaveBeenCalledWith({
      channel: 'whatsapp',
      phone: '+6281111111111',
      email: null,
      otpId: OTP_ID,
    });
  });

  it('marks an email code as proving the address only', async () => {
    vi.mocked(verifyPhoneOtp).mockResolvedValue({
      ...VERIFIED,
      phone: null,
      email: 'ani@example.test',
    });
    const emailCheck = { ...CHECK, channel: 'email', email: 'Ani@Example.test' };
    await expect(verifyPhoneOtpAction(emailCheck)).resolves.toEqual({
      ok: true,
      data: { channel: 'email' },
    });
    expect(vi.mocked(verifyPhoneOtp).mock.calls[0]?.[0].email).toBe('ani@example.test');
    expect(rememberPhoneProof).toHaveBeenCalledWith(
      expect.objectContaining({ channel: 'email', phone: '+6281234567890' }),
    );
  });

  // Review of PR #20, L3: a code issued to prove a data request is no proof of a booking's phone.
  it('refuses a verified code issued for any other purpose and sets no cookie', async () => {
    vi.mocked(verifyPhoneOtp).mockResolvedValue({ ...VERIFIED, purpose: 'dsr_identity' });
    await expect(verifyPhoneOtpAction(CHECK)).resolves.toEqual({
      ok: false,
      error: { code: 'VALIDATION', message: text.invalid, fieldErrors: { code: [text.invalid] } },
    });
    expect(rememberPhoneProof).not.toHaveBeenCalled();
  });

  it('refuses a browser that holds no code without asking the database', async () => {
    vi.mocked(readOtpBrowserCookie).mockResolvedValueOnce(null);
    await expect(verifyPhoneOtpAction(CHECK)).resolves.toMatchObject({
      ok: false,
      error: { code: 'VALIDATION', message: text.invalid },
    });
    expect(verifyPhoneOtp).not.toHaveBeenCalled();
  });

  it.each([
    [{ status: 'wrong_code', attemptsLeft: 3 } as const, text.wrongCode(3)],
    [{ status: 'locked' } as const, text.locked],
    [{ status: 'expired' } as const, text.expired],
    [{ status: 'invalid' } as const, text.invalid],
  ])('answers %j under the code field and sets no cookie', async (checked, message) => {
    vi.mocked(verifyPhoneOtp).mockResolvedValue(checked);
    await expect(verifyPhoneOtpAction(CHECK)).resolves.toEqual({
      ok: false,
      error: { code: 'VALIDATION', message, fieldErrors: { code: [message] } },
    });
    expect(rememberPhoneProof).not.toHaveBeenCalled();
  });

  it('counts tries per IP before the code is checked', async () => {
    vi.mocked(withinGuestLimits).mockResolvedValueOnce(false);
    expect(await verifyPhoneOtpAction(CHECK)).toMatchObject({
      ok: false,
      error: { code: 'RATE_LIMITED' },
    });
    expect(verifyPhoneOtp).not.toHaveBeenCalled();
    expect(await verifyPhoneOtpAction({ ...CHECK, code: '12345' })).toMatchObject({ ok: false });
  });
});
