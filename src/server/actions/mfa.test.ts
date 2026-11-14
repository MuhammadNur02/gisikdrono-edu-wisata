import { beforeEach, describe, expect, it, vi } from 'vitest';

import { copy } from '@/lib/copy/id';
import { fail } from '@/lib/errors';
import { verifyTurnstile } from '@/lib/turnstile';
import { readStaffSession, requireUser, type StaffContext } from '@/server/auth/guards';
import {
  confirmTotpEnrolment,
  startTotpEnrolment,
  verifyTotp,
} from '@/server/services/auth-service';
import { reenrolmentStateOf, spendReenrolmentCode } from '@/server/services/staff-service';

import { confirmMfaEnrolmentAction, startMfaEnrolmentAction, verifyMfaAction } from './mfa';

vi.mock('next/headers', () => ({ headers: () => Promise.resolve(new Headers()) }));
vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
  requestIdFrom: () => 'request-1',
}));
vi.mock('@/lib/turnstile', () => ({ verifyTurnstile: vi.fn() }));
vi.mock('@/server/auth/guards', () => ({ requireUser: vi.fn(), readStaffSession: vi.fn() }));
vi.mock('@/server/services/staff-service', () => ({
  reenrolmentStateOf: vi.fn(),
  spendReenrolmentCode: vi.fn(),
}));
vi.mock('@/server/services/auth-service', () => ({
  confirmTotpEnrolment: vi.fn(),
  startTotpEnrolment: vi.fn(),
  verifyTotp: vi.fn(),
}));

const OFFICER_AAL1: StaffContext = {
  userId: 'user-1',
  role: 'admin_rw',
  rwId: 5,
  isAal2: false,
  totpVerifiedAt: null,
  claimsVersion: 1,
};
const FACTOR_ID = '6f1c2d3e-4a5b-4c6d-8e7f-0123456789ab';

beforeEach(() => {
  vi.mocked(verifyTurnstile).mockReset().mockResolvedValue(true);
  vi.mocked(requireUser).mockReset().mockResolvedValue({ ok: true, ctx: OFFICER_AAL1 });
  vi.mocked(verifyTotp).mockReset().mockResolvedValue('verified');
  vi.mocked(startTotpEnrolment).mockReset();
  vi.mocked(confirmTotpEnrolment).mockReset().mockResolvedValue('confirmed');
});

describe('verifyMfaAction', () => {
  it('lifts the session and goes on to the dashboard page that was asked for', async () => {
    expect(
      await verifyMfaAction({ code: '123456', captchaToken: 't', next: '/dashboard/scanner' }),
    ).toEqual({ ok: true, data: { redirectTo: '/dashboard/scanner' } });
    expect(verifyTotp).toHaveBeenCalledWith('123456');
  });

  it('puts a wrong code under the field', async () => {
    vi.mocked(verifyTotp).mockResolvedValue('wrong_code');

    expect(await verifyMfaAction({ code: '000000', captchaToken: 't' })).toMatchObject({
      error: { code: 'VALIDATION', fieldErrors: { code: [copy.auth.mfa.failed] } },
    });
  });

  // M1 of the PR #17 review.
  it('says the account is locked for a while rather than that the code is wrong', async () => {
    vi.mocked(verifyTotp).mockResolvedValue('locked');

    expect(await verifyMfaAction({ code: '123456', captchaToken: 't' })).toEqual({
      ok: false,
      error: {
        code: 'RATE_LIMITED',
        message: 'Terlalu banyak kode yang salah. Coba lagi dalam 15 menit.',
      },
    });
  });

  it('refuses without a passed Turnstile check or without a staff role', async () => {
    vi.mocked(verifyTurnstile).mockResolvedValueOnce(false);
    expect(await verifyMfaAction({ code: '123456', captchaToken: 't' })).toMatchObject({
      error: { code: 'VALIDATION' },
    });

    vi.mocked(requireUser).mockResolvedValue({
      ok: false,
      error: { code: 'FORBIDDEN', message: copy.errors.FORBIDDEN },
    });
    expect(await verifyMfaAction({ code: '123456', captchaToken: 't' })).toMatchObject({
      error: { code: 'FORBIDDEN' },
    });
    expect(verifyTotp).not.toHaveBeenCalled();
  });
});

describe('startMfaEnrolmentAction', () => {
  it('returns the factor, its secret and the QR code as a path, never as a data URL', async () => {
    vi.mocked(startTotpEnrolment).mockResolvedValue({
      factorId: FACTOR_ID,
      secret: 'JBSWY3DPEHPK3PXP',
      uri: 'otpauth://totp/Edu%20Wisata%20Gisikdrono:a%40b.test?secret=JBSWY3DPEHPK3PXP',
    });

    const result = await startMfaEnrolmentAction();

    expect(result).toMatchObject({
      ok: true,
      data: { factorId: FACTOR_ID, secret: 'JBSWY3DPEHPK3PXP' },
    });
    expect(result.ok && result.data.qr.path).toMatch(/^M0 0h7v1h-7z/);
  });

  it('answers CONFLICT for an account that already has a verified factor', async () => {
    const { AppError } = await import('@/lib/errors');
    vi.mocked(startTotpEnrolment).mockRejectedValue(new AppError('CONFLICT'));

    expect(await startMfaEnrolmentAction()).toMatchObject({ error: { code: 'CONFLICT' } });
  });
});

describe('confirmMfaEnrolmentAction', () => {
  it('confirms the factor and goes on to the dashboard', async () => {
    expect(await confirmMfaEnrolmentAction({ factorId: FACTOR_ID, code: '123456' })).toEqual({
      ok: true,
      data: { redirectTo: '/dashboard' },
    });
  });

  it('tells an expired QR code apart from a wrong code', async () => {
    vi.mocked(confirmTotpEnrolment).mockResolvedValueOnce('expired');
    expect(await confirmMfaEnrolmentAction({ factorId: FACTOR_ID, code: '123456' })).toMatchObject({
      error: { code: 'STATE_INVALID', message: copy.auth.mfa.enrollExpired },
    });

    vi.mocked(confirmTotpEnrolment).mockResolvedValueOnce('wrong_code');
    expect(await confirmMfaEnrolmentAction({ factorId: FACTOR_ID, code: '123456' })).toMatchObject({
      error: { code: 'VALIDATION', fieldErrors: { code: [copy.auth.mfa.failed] } },
    });
  });

  it('says the account is locked when the first codes were wrong too often', async () => {
    vi.mocked(confirmTotpEnrolment).mockResolvedValueOnce('locked');

    expect(await confirmMfaEnrolmentAction({ factorId: FACTOR_ID, code: '123456' })).toEqual({
      ok: false,
      error: {
        code: 'RATE_LIMITED',
        message: 'Terlalu banyak kode yang salah. Coba lagi dalam 15 menit.',
      },
    });
  });

  it('says so when another QR code of the account was confirmed first', async () => {
    vi.mocked(confirmTotpEnrolment).mockResolvedValueOnce('duplicate');

    expect(await confirmMfaEnrolmentAction({ factorId: FACTOR_ID, code: '123456' })).toEqual({
      ok: false,
      error: {
        code: 'CONFLICT',
        message:
          'Akun ini sudah memasang aplikasi autentikator dari kode QR lain. Pakai kode dari aplikasi itu.',
      },
    });
  });
});

// Task P4.8.05: an account whose authenticator was reset has no role, and enrols a new one with the superadmin's code.
describe('enrolment after an MFA reset', () => {
  const RESET_ACCOUNT: StaffContext = { ...OFFICER_AAL1, role: 'none', rwId: null };
  const CODE = 'ABCDE-FGHJK-MNPQR-STVWX';
  const ENROLMENT = {
    factorId: FACTOR_ID,
    secret: 'JBSWY3DPEHPK3PXP',
    uri: 'otpauth://totp/Edu%20Wisata%20Gisikdrono:a%40b.test?secret=JBSWY3DPEHPK3PXP',
  };

  beforeEach(() => {
    vi.mocked(requireUser).mockResolvedValue(fail('FORBIDDEN'));
    vi.mocked(readStaffSession).mockResolvedValue({
      ctx: RESET_ACCOUNT,
      hasVerifiedTotp: false,
      authMethods: ['password'],
    });
    vi.mocked(reenrolmentStateOf).mockReset().mockResolvedValue('needs_code');
    vi.mocked(spendReenrolmentCode).mockReset().mockResolvedValue(true);
    vi.mocked(startTotpEnrolment).mockResolvedValue(ENROLMENT);
  });

  it('uses the code once, in the same call that makes the QR code', async () => {
    const result = await startMfaEnrolmentAction({ reenrolmentCode: CODE });

    expect(result).toMatchObject({ ok: true, data: { factorId: FACTOR_ID } });
    expect(spendReenrolmentCode).toHaveBeenCalledTimes(1);
    expect(spendReenrolmentCode).toHaveBeenCalledWith(
      'user-1',
      expect.stringMatching(/^[0-9a-f]{64}$/),
    );
  });

  it('makes no QR code without the code, or with a wrong one', async () => {
    const refused = {
      error: {
        code: 'VALIDATION',
        fieldErrors: { reenrolmentCode: [copy.auth.mfa.reenrolCodeWrong] },
      },
    };

    expect(await startMfaEnrolmentAction({})).toMatchObject(refused);
    vi.mocked(spendReenrolmentCode).mockResolvedValueOnce(false);
    expect(await startMfaEnrolmentAction({ reenrolmentCode: CODE })).toMatchObject(refused);
    expect(startTotpEnrolment).not.toHaveBeenCalled();
  });

  it('needs no second code while the ten minutes a used code opened last', async () => {
    vi.mocked(reenrolmentStateOf).mockResolvedValue('window_open');

    expect(await startMfaEnrolmentAction({})).toMatchObject({ ok: true });
    expect(spendReenrolmentCode).not.toHaveBeenCalled();
  });

  it('lets the reset account confirm its new factor', async () => {
    expect(await confirmMfaEnrolmentAction({ factorId: FACTOR_ID, code: '123456' })).toEqual({
      ok: true,
      data: { redirectTo: '/dashboard' },
    });
  });

  it('keeps out an account without a role that is not waiting for re-enrolment', async () => {
    vi.mocked(reenrolmentStateOf).mockResolvedValue('none');

    expect(await startMfaEnrolmentAction({})).toMatchObject({ error: { code: 'FORBIDDEN' } });
    expect(await confirmMfaEnrolmentAction({ factorId: FACTOR_ID, code: '123456' })).toMatchObject({
      error: { code: 'FORBIDDEN' },
    });
  });
});
