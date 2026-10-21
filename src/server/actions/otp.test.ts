import { after } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { copy } from '@/lib/copy/id';
import { verifyTurnstile } from '@/lib/turnstile';
import { rememberPhoneProof } from '@/server/auth/guest-cookies';
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
vi.mock('@/server/auth/guest-cookies', () => ({ rememberPhoneProof: vi.fn() }));
vi.mock('@/server/services/notification-service', () => ({ kickNotificationWorker: vi.fn() }));
vi.mock('@/server/services/booking-service', () => ({
  issuePhoneOtp: vi.fn(),
  verifyPhoneOtp: vi.fn(),
  withinGuestLimits: vi.fn(),
}));

const text = copy.booking.otp;
const OTP_ID = '0192f3a4-5b6c-7d8e-9f01-0000000000aa';
const REQUEST = { phone: '0812-3456-7890', turnstileToken: 'turnstile-token' };

beforeEach(() => {
  vi.mocked(withinGuestLimits).mockReset().mockResolvedValue(true);
  vi.mocked(verifyTurnstile).mockReset().mockResolvedValue(true);
  vi.mocked(issuePhoneOtp).mockReset();
  vi.mocked(verifyPhoneOtp).mockReset();
  vi.mocked(rememberPhoneProof).mockReset();
  vi.mocked(after).mockReset();
});

describe('requestPhoneOtpAction', () => {
  it('issues a WhatsApp code for the normalised number and sends it at once', async () => {
    vi.mocked(issuePhoneOtp).mockResolvedValue({
      status: 'sent',
      otpId: OTP_ID,
      expiresAt: 'later',
    });
    await expect(requestPhoneOtpAction(REQUEST)).resolves.toEqual({
      ok: true,
      data: { status: 'sent', otpId: OTP_ID, channel: 'whatsapp', resendAfterSeconds: 60 },
    });
    expect(issuePhoneOtp).toHaveBeenCalledWith({
      channel: 'whatsapp',
      phone: '+6281234567890',
      email: null,
      clientIp: '203.0.113.7',
    });
    expect(verifyTurnstile).toHaveBeenCalledWith('turnstile-token', '203.0.113.7', 'otp_request');
    expect(after).toHaveBeenCalledTimes(1);
  });

  it('checks the email fallback against its own Turnstile action', async () => {
    vi.mocked(issuePhoneOtp).mockResolvedValue({
      status: 'sent',
      otpId: OTP_ID,
      expiresAt: 'later',
    });
    await requestPhoneOtpAction({ ...REQUEST, channel: 'email', email: 'Ani@Example.test' });
    expect(verifyTurnstile).toHaveBeenCalledWith('turnstile-token', '203.0.113.7', 'otp_email');
    expect(vi.mocked(issuePhoneOtp).mock.calls[0]?.[0].email).toBe('ani@example.test');
  });

  it('switches the form to email when WhatsApp is limited, sending nothing', async () => {
    vi.mocked(issuePhoneOtp).mockResolvedValue({ status: 'degraded' });
    await expect(requestPhoneOtpAction(REQUEST)).resolves.toEqual({
      ok: true,
      data: { status: 'degraded' },
    });
    expect(after).not.toHaveBeenCalled();
  });

  it.each([
    [{ status: 'cooldown', retryAfterSeconds: 42 } as const, 'RATE_LIMITED', text.cooldown(42)],
    [{ status: 'limited' } as const, 'RATE_LIMITED', text.limited],
    [{ status: 'unavailable' } as const, 'VALIDATION', text.unavailable],
  ])('explains %j to the visitor', async (issued, code, message) => {
    vi.mocked(issuePhoneOtp).mockResolvedValue(issued);
    await expect(requestPhoneOtpAction(REQUEST)).resolves.toEqual({
      ok: false,
      error: { code, message },
    });
  });

  it('refuses before the database over the IP limit or without a human check', async () => {
    vi.mocked(withinGuestLimits).mockResolvedValueOnce(false);
    expect((await requestPhoneOtpAction(REQUEST)).ok).toBe(false);
    vi.mocked(verifyTurnstile).mockResolvedValueOnce(false);
    const refused = await requestPhoneOtpAction(REQUEST);
    expect(refused).toMatchObject({
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
      expect(await requestPhoneOtpAction(input)).toMatchObject({
        ok: false,
        error: { code: 'VALIDATION' },
      });
    }
    expect(issuePhoneOtp).not.toHaveBeenCalled();
  });
});

describe('verifyPhoneOtpAction', () => {
  const CHECK = { otpId: OTP_ID, code: '482913', phone: '+6281234567890' };

  it('remembers the number the database verified, not the one the form sent', async () => {
    vi.mocked(verifyPhoneOtp).mockResolvedValue({
      status: 'verified',
      phone: '+6281111111111',
      email: null,
    });
    await expect(verifyPhoneOtpAction(CHECK)).resolves.toEqual({
      ok: true,
      data: { channel: 'whatsapp' },
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
      status: 'verified',
      phone: null,
      email: 'ani@example.test',
    });
    await expect(verifyPhoneOtpAction(CHECK)).resolves.toEqual({
      ok: true,
      data: { channel: 'email' },
    });
    expect(rememberPhoneProof).toHaveBeenCalledWith(
      expect.objectContaining({ channel: 'email', phone: '+6281234567890' }),
    );
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
