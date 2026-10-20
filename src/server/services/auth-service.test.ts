import { AuthApiError } from '@supabase/supabase-js';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { StaffSession } from '@/server/auth/guards';

import {
  changePasswordAfterRecovery,
  confirmTotpEnrolment,
  openRecoverySession,
  signInWithPassword,
  signOutEverywhere,
  startTotpEnrolment,
  verifyTotp,
} from './auth-service';

type Factor = {
  id: string;
  factor_type: string;
  status: 'verified' | 'unverified';
  created_at?: string;
};

// The parts of the session client's auth API this service calls, each a mock a test can steer.
const auth = vi.hoisted(() => ({
  signInWithPassword: vi.fn(),
  updateUser: vi.fn(),
  signOut: vi.fn(),
  verifyOtp: vi.fn(),
  mfa: {
    listFactors: vi.fn(),
    challengeAndVerify: vi.fn(),
    enroll: vi.fn(),
    unenroll: vi.fn(),
  },
}));

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: () => Promise.resolve({ auth }),
}));
vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
  requestIdFrom: () => 'request-1',
}));

const VERIFIED: Factor = { id: 'factor-1', factor_type: 'totp', status: 'verified' };
const PENDING: Factor = {
  id: '6f1c2d3e-4a5b-4c6d-8e7f-0123456789ab',
  factor_type: 'totp',
  status: 'unverified',
};

function factors(...all: Factor[]) {
  return { data: { all, totp: all.filter((f) => f.status === 'verified') }, error: null };
}

const refused = (status: number, code: string) => new AuthApiError('refused', status, code);

const RECOVERY: StaffSession = {
  ctx: {
    userId: 'u',
    role: 'admin_rw',
    rwId: 5,
    isAal2: false,
    totpVerifiedAt: null,
    claimsVersion: 1,
  },
  hasVerifiedTotp: true,
  authMethods: ['otp'],
};

beforeEach(() => {
  for (const mock of [...Object.values(auth), ...Object.values(auth.mfa)]) {
    if (typeof mock === 'function') mock.mockReset();
  }
  auth.mfa.listFactors.mockResolvedValue(factors(VERIFIED));
  auth.mfa.challengeAndVerify.mockResolvedValue({ data: {}, error: null });
  auth.updateUser.mockResolvedValue({ data: {}, error: null });
  auth.signOut.mockResolvedValue({ error: null });
});

describe('signInWithPassword', () => {
  const credentials = { email: 'a@b.test', password: 'pw', captchaToken: 'token' };

  it('passes the captcha token to Supabase Auth and reports a verified factor', async () => {
    auth.signInWithPassword.mockResolvedValue({
      data: { user: { factors: [VERIFIED] } },
      error: null,
    });

    expect(await signInWithPassword(credentials)).toEqual({ ok: true, hasVerifiedTotp: true });
    expect(auth.signInWithPassword).toHaveBeenCalledWith({
      email: 'a@b.test',
      password: 'pw',
      options: { captchaToken: 'token' },
    });
  });

  it.each([
    [refused(400, 'invalid_credentials'), 'refused'],
    [refused(400, 'captcha_failed'), 'captcha'],
    [refused(429, 'over_request_rate_limit'), 'rate_limited'],
  ])('maps a refusal to one of three answers', async (error, reason) => {
    auth.signInWithPassword.mockResolvedValue({ data: { user: null }, error });

    expect(await signInWithPassword(credentials)).toEqual({ ok: false, reason });
  });

  it('throws an outage on, so it never reads as a wrong password', async () => {
    auth.signInWithPassword.mockResolvedValue({
      data: { user: null },
      error: refused(500, 'unexpected_failure'),
    });

    await expect(signInWithPassword(credentials)).rejects.toBeInstanceOf(AuthApiError);
  });
});

describe('verifyTotp', () => {
  // M1 of the PR #17 review: the MFA hook refuses every code while the account is locked.
  it('tells a locked account apart from a wrong code', async () => {
    auth.mfa.challengeAndVerify.mockResolvedValueOnce({
      data: null,
      error: refused(403, 'mfa_verification_rejected'),
    });

    expect(await verifyTotp('123456')).toBe('locked');
  });

  it('verifies against the verified factor', async () => {
    expect(await verifyTotp('123456')).toBe('verified');
    expect(auth.mfa.challengeAndVerify).toHaveBeenCalledWith({
      factorId: 'factor-1',
      code: '123456',
    });
  });

  it('is false for a wrong code and without a verified factor', async () => {
    auth.mfa.challengeAndVerify.mockResolvedValueOnce({
      data: null,
      error: refused(422, 'mfa_verification_failed'),
    });
    expect(await verifyTotp('000000')).toBe('wrong_code');

    auth.mfa.listFactors.mockResolvedValueOnce(factors(PENDING));
    expect(await verifyTotp('123456')).toBe('wrong_code');
  });
});

describe('changePasswordAfterRecovery', () => {
  // M2 of the PR #17 review: without a factor, the mailbox alone would set a permanent password.
  it('refuses an account without a verified factor before anything else', async () => {
    const withoutFactor = { ...RECOVERY, hasVerifiedTotp: false };

    expect(await changePasswordAfterRecovery(withoutFactor, { password: 'x' })).toBe('no_factor');
    expect(auth.updateUser).not.toHaveBeenCalled();
  });

  it('asks for the code first when the account has a factor and the session is AAL1', async () => {
    expect(await changePasswordAfterRecovery(RECOVERY, { password: 'x' })).toBe('needs_totp');

    auth.mfa.challengeAndVerify.mockResolvedValueOnce({
      data: null,
      error: refused(422, 'mfa_verification_failed'),
    });
    expect(await changePasswordAfterRecovery(RECOVERY, { password: 'x', totpCode: '000000' })).toBe(
      'wrong_totp',
    );
    expect(auth.updateUser).not.toHaveBeenCalled();
  });

  it('changes the password, then ends every session of the account', async () => {
    expect(await changePasswordAfterRecovery(RECOVERY, { password: 'x', totpCode: '123456' })).toBe(
      'changed',
    );
    expect(auth.updateUser).toHaveBeenCalledWith({ password: 'x' });
    expect(auth.signOut).toHaveBeenCalledWith({ scope: 'global' });
  });

  it('says so when the account is locked after too many wrong codes', async () => {
    auth.mfa.challengeAndVerify.mockResolvedValueOnce({
      data: null,
      error: refused(403, 'mfa_verification_rejected'),
    });

    expect(await changePasswordAfterRecovery(RECOVERY, { password: 'x', totpCode: '123456' })).toBe(
      'totp_locked',
    );
    expect(auth.updateUser).not.toHaveBeenCalled();
  });

  // S1 of the PR #17 review: the other devices may still be signed in, and the staff member has to know.
  it('says so when the other sessions could not be ended', async () => {
    auth.signOut.mockResolvedValue({ error: refused(500, 'unexpected_failure') });

    expect(await changePasswordAfterRecovery(RECOVERY, { password: 'x', totpCode: '123456' })).toBe(
      'changed_sessions_remain',
    );
  });

  it('tells a reused password apart from a weak or leaked one', async () => {
    const aal2 = { ...RECOVERY, ctx: { ...RECOVERY.ctx, isAal2: true } };
    auth.updateUser.mockResolvedValueOnce({ data: null, error: refused(422, 'same_password') });
    expect(await changePasswordAfterRecovery(aal2, { password: 'x' })).toBe('same');

    auth.updateUser.mockResolvedValueOnce({ data: null, error: refused(422, 'weak_password') });
    expect(await changePasswordAfterRecovery(aal2, { password: 'x' })).toBe('weak');
    expect(auth.signOut).not.toHaveBeenCalled();
  });
});

describe('TOTP enrolment', () => {
  it('removes an abandoned enrolment before starting a new one', async () => {
    auth.mfa.listFactors.mockResolvedValue(factors(PENDING));
    auth.mfa.unenroll.mockResolvedValue({ data: {}, error: null });
    auth.mfa.enroll.mockResolvedValue({
      data: { id: 'factor-2', totp: { secret: 'SECRET', uri: 'otpauth://totp/x' } },
      error: null,
    });

    expect(await startTotpEnrolment()).toEqual({
      factorId: 'factor-2',
      secret: 'SECRET',
      uri: 'otpauth://totp/x',
    });
    expect(auth.mfa.unenroll).toHaveBeenCalledWith({ factorId: PENDING.id });
    expect(auth.mfa.enroll).toHaveBeenCalledWith({
      factorType: 'totp',
      issuer: 'Edu Wisata Gisikdrono',
    });
  });

  it('never adds a second factor', async () => {
    await expect(startTotpEnrolment()).rejects.toMatchObject({ code: 'CONFLICT' });
    await expect(confirmTotpEnrolment(PENDING.id, '123456')).rejects.toMatchObject({
      code: 'CONFLICT',
    });
    expect(auth.mfa.enroll).not.toHaveBeenCalled();
  });

  // M3 of the PR #17 review: two enrolments started before either was confirmed can both pass the check, which would
  // leave two verified factors (and staff_token_claims would then drop the role).
  it('removes this factor again when another one of the account was confirmed first', async () => {
    const pendingSince = { ...PENDING, created_at: '2026-10-20T07:00:05Z' };
    const confirmedFirst: Factor = {
      id: 'factor-0',
      factor_type: 'totp',
      status: 'verified',
      created_at: '2026-10-20T07:00:01Z',
    };
    auth.mfa.listFactors
      .mockResolvedValueOnce(factors(pendingSince))
      .mockResolvedValueOnce(factors(confirmedFirst, { ...pendingSince, status: 'verified' }));
    auth.mfa.unenroll.mockResolvedValue({ data: {}, error: null });

    expect(await confirmTotpEnrolment(PENDING.id, '123456')).toBe('duplicate');
    expect(auth.mfa.unenroll).toHaveBeenCalledWith({ factorId: PENDING.id });
  });

  // Measured on the local stack: with two confirmations at the same moment both succeed and Supabase Auth itself
  // keeps one verified factor, which may be the other one.
  it('reports a factor Supabase Auth already removed in the race, removing nothing more', async () => {
    const confirmedFirst: Factor = { id: 'factor-0', factor_type: 'totp', status: 'verified' };
    auth.mfa.listFactors
      .mockResolvedValueOnce(factors(PENDING))
      .mockResolvedValueOnce(factors(confirmedFirst));

    expect(await confirmTotpEnrolment(PENDING.id, '123456')).toBe('duplicate');
    expect(auth.mfa.unenroll).not.toHaveBeenCalled();
  });

  it('keeps this factor when it was the first of the two to be enrolled', async () => {
    const pendingSince = { ...PENDING, created_at: '2026-10-20T07:00:01Z' };
    const enrolledLater: Factor = {
      id: 'factor-9',
      factor_type: 'totp',
      status: 'verified',
      created_at: '2026-10-20T07:00:05Z',
    };
    auth.mfa.listFactors
      .mockResolvedValueOnce(factors(pendingSince))
      .mockResolvedValueOnce(factors({ ...pendingSince, status: 'verified' }, enrolledLater));

    expect(await confirmTotpEnrolment(PENDING.id, '123456')).toBe('confirmed');
    expect(auth.mfa.unenroll).not.toHaveBeenCalled();
  });

  it('tells a locked account apart from a wrong first code', async () => {
    auth.mfa.listFactors.mockResolvedValue(factors(PENDING));
    auth.mfa.challengeAndVerify.mockResolvedValueOnce({
      data: null,
      error: refused(403, 'mfa_verification_rejected'),
    });

    expect(await confirmTotpEnrolment(PENDING.id, '123456')).toBe('locked');
  });

  it('confirms only the pending factor of this account', async () => {
    auth.mfa.listFactors
      .mockResolvedValueOnce(factors(PENDING))
      .mockResolvedValueOnce(factors({ ...PENDING, status: 'verified' }))
      .mockResolvedValue(factors(PENDING));

    expect(await confirmTotpEnrolment(PENDING.id, '123456')).toBe('confirmed');
    expect(await confirmTotpEnrolment('7a1c2d3e-4a5b-4c6d-8e7f-0123456789ab', '123456')).toBe(
      'expired',
    );
  });
});

// F1 of the PR #17 review: the recovery email carries a token_hash, which auth/callback verifies here. Unlike a PKCE
// code it is not tied to the browser that asked, so /forgot-password writes no cookie at all.
describe('openRecoverySession', () => {
  it('opens the session of a recovery link', async () => {
    auth.verifyOtp.mockResolvedValue({ data: {}, error: null });

    expect(await openRecoverySession('token-hash')).toBe(true);
    expect(auth.verifyOtp).toHaveBeenCalledWith({ type: 'recovery', token_hash: 'token-hash' });
  });

  it('is false for a used or expired link', async () => {
    auth.verifyOtp.mockResolvedValue({ data: {}, error: refused(403, 'otp_expired') });

    expect(await openRecoverySession('token-hash')).toBe(false);
  });

  it('throws an outage on, so it never reads as an expired link', async () => {
    auth.verifyOtp.mockResolvedValue({ data: {}, error: refused(500, 'unexpected_failure') });

    await expect(openRecoverySession('token-hash')).rejects.toBeInstanceOf(AuthApiError);
  });
});

describe('signOutEverywhere', () => {
  it('ends every session of the account', async () => {
    expect(await signOutEverywhere()).toBe(true);
    expect(auth.signOut).toHaveBeenCalledWith({ scope: 'global' });
  });

  it('is false when Supabase Auth could not end the other sessions', async () => {
    auth.signOut.mockResolvedValue({ error: refused(500, 'unexpected_failure') });

    expect(await signOutEverywhere()).toBe(false);
  });
});
