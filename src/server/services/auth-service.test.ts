import { AuthApiError } from '@supabase/supabase-js';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { StaffSession } from '@/server/auth/guards';
import { canResetPassword } from '@/server/services/staff-service';

import {
  changePasswordAfterRecovery,
  confirmTotpEnrolment,
  exchangeAuthCode,
  sendPasswordReset,
  signInWithPassword,
  startTotpEnrolment,
  verifyTotp,
} from './auth-service';

type Factor = { id: string; factor_type: string; status: 'verified' | 'unverified' };

// The parts of the session client's auth API this service calls, each a mock a test can steer.
const auth = vi.hoisted(() => ({
  signInWithPassword: vi.fn(),
  resetPasswordForEmail: vi.fn(),
  updateUser: vi.fn(),
  signOut: vi.fn(),
  exchangeCodeForSession: vi.fn(),
  getClaims: vi.fn(),
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
vi.mock('@/server/services/staff-service', () => ({ canResetPassword: vi.fn() }));
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
  authMethods: ['recovery'],
};

beforeEach(() => {
  for (const mock of [...Object.values(auth), ...Object.values(auth.mfa)]) {
    if (typeof mock === 'function') mock.mockReset();
  }
  auth.mfa.listFactors.mockResolvedValue(factors(VERIFIED));
  auth.mfa.challengeAndVerify.mockResolvedValue({ data: {}, error: null });
  auth.updateUser.mockResolvedValue({ data: {}, error: null });
  auth.signOut.mockResolvedValue({ error: null });
  vi.mocked(canResetPassword).mockReset().mockResolvedValue(true);
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

describe('sendPasswordReset', () => {
  const request = { email: 'a@b.test', captchaToken: 'token' };

  it('sends the link back to auth/callback only', async () => {
    auth.resetPasswordForEmail.mockResolvedValue({ data: {}, error: null });

    await sendPasswordReset(request, new Headers());

    expect(auth.resetPasswordForEmail).toHaveBeenCalledWith('a@b.test', {
      redirectTo: 'http://127.0.0.1:3000/auth/callback',
      captchaToken: 'token',
    });
  });

  it('sends nothing to an account that never finished onboarding', async () => {
    vi.mocked(canResetPassword).mockResolvedValue(false);

    await sendPasswordReset(request, new Headers());

    expect(auth.resetPasswordForEmail).not.toHaveBeenCalled();
  });

  it('keeps a Supabase Auth refusal to itself', async () => {
    auth.resetPasswordForEmail.mockResolvedValue({
      data: null,
      error: refused(429, 'over_email_send_rate_limit'),
    });

    await expect(sendPasswordReset(request, new Headers())).resolves.toBeUndefined();
  });
});

describe('verifyTotp', () => {
  it('verifies against the verified factor', async () => {
    expect(await verifyTotp('123456')).toBe(true);
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
    expect(await verifyTotp('000000')).toBe(false);

    auth.mfa.listFactors.mockResolvedValueOnce(factors(PENDING));
    expect(await verifyTotp('123456')).toBe(false);
  });
});

describe('changePasswordAfterRecovery', () => {
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

  it('confirms only the pending factor of this account', async () => {
    auth.mfa.listFactors.mockResolvedValue(factors(PENDING));

    expect(await confirmTotpEnrolment(PENDING.id, '123456')).toBe('confirmed');
    expect(await confirmTotpEnrolment('7a1c2d3e-4a5b-4c6d-8e7f-0123456789ab', '123456')).toBe(
      'expired',
    );
  });
});

describe('exchangeAuthCode', () => {
  it('reads from the verified token whether a recovery link opened the session', async () => {
    auth.exchangeCodeForSession.mockResolvedValue({ data: {}, error: null });
    auth.getClaims.mockResolvedValue({
      data: { claims: { amr: [{ method: 'recovery', timestamp: 1 }] } },
    });

    expect(await exchangeAuthCode('code')).toEqual({ isRecovery: true });
  });

  it('is null for a used, expired or foreign link', async () => {
    auth.exchangeCodeForSession.mockResolvedValue({
      data: {},
      error: refused(400, 'flow_state_not_found'),
    });

    expect(await exchangeAuthCode('code')).toBeNull();
  });
});
