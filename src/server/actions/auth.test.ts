import { after } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { copy } from '@/lib/copy/id';
import { verifyTurnstile } from '@/lib/turnstile';
import { readStaffSession, type StaffSession } from '@/server/auth/guards';
import { changePasswordAfterRecovery, signInWithPassword } from '@/server/services/auth-service';
import {
  recordSessionRevokeFailure,
  sendPasswordResetEmail,
  withinPasswordResetLimits,
  withinSignInLimits,
} from '@/server/services/staff-service';

import { requestPasswordResetAction, resetPasswordAction, signInAction } from './auth';

vi.mock('next/headers', () => ({
  headers: () => Promise.resolve(new Headers({ 'x-real-ip': '203.0.113.7' })),
}));
vi.mock('next/server', () => ({ after: vi.fn() }));
vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
  requestIdFrom: () => 'request-1',
}));
vi.mock('@/lib/turnstile', () => ({ verifyTurnstile: vi.fn() }));
vi.mock('@/server/auth/guards', () => ({ readStaffSession: vi.fn() }));
vi.mock('@/server/services/auth-service', () => ({
  changePasswordAfterRecovery: vi.fn(),
  signInWithPassword: vi.fn(),
}));
vi.mock('@/server/services/staff-service', () => ({
  recordSessionRevokeFailure: vi.fn(),
  sendPasswordResetEmail: vi.fn(),
  withinPasswordResetLimits: vi.fn(),
  withinSignInLimits: vi.fn(),
}));

const CREDENTIALS = {
  email: ' Admin-RW05@Dev.Gisikdrono.Test ',
  password: 'DEV-ONLY-local-Password-1!',
  captchaToken: 'turnstile-token',
};

const RECOVERY_SESSION: StaffSession = {
  ctx: {
    userId: 'user-1',
    role: 'admin_rw',
    rwId: 5,
    isAal2: false,
    totpVerifiedAt: null,
    claimsVersion: 1,
  },
  hasVerifiedTotp: true,
  authMethods: ['otp'],
};

const NEW_PASSWORD = {
  password: 'Another-Strong-Pass-2!',
  confirmPassword: 'Another-Strong-Pass-2!',
  totpCode: '123456',
  captchaToken: 'turnstile-token',
};

beforeEach(() => {
  vi.mocked(withinSignInLimits).mockReset().mockResolvedValue(true);
  vi.mocked(withinPasswordResetLimits).mockReset().mockResolvedValue(true);
  vi.mocked(signInWithPassword).mockReset().mockResolvedValue({ ok: true, hasVerifiedTotp: true });
  vi.mocked(sendPasswordResetEmail).mockReset().mockResolvedValue(undefined);
  vi.mocked(after).mockReset();
  vi.mocked(verifyTurnstile).mockReset().mockResolvedValue(true);
  vi.mocked(readStaffSession).mockReset().mockResolvedValue(RECOVERY_SESSION);
  vi.mocked(changePasswordAfterRecovery).mockReset().mockResolvedValue('changed');
});

describe('signInAction', () => {
  it('sends a staff member with a factor on to the TOTP step, keeping a dashboard page', async () => {
    const result = await signInAction({ ...CREDENTIALS, next: '/dashboard/sessions' });

    expect(result).toEqual({
      ok: true,
      data: { redirectTo: '/mfa/verify?next=%2Fdashboard%2Fsessions' },
    });
    expect(withinSignInLimits).toHaveBeenCalledWith(
      '203.0.113.7',
      'admin-rw05@dev.gisikdrono.test',
    );
    expect(signInWithPassword).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'admin-rw05@dev.gisikdrono.test',
        captchaToken: 'turnstile-token',
      }),
    );
  });

  it('sends an account without a factor to enrolment, and never off the dashboard', async () => {
    vi.mocked(signInWithPassword).mockResolvedValue({ ok: true, hasVerifiedTotp: false });

    const result = await signInAction({ ...CREDENTIALS, next: '//evil.test' });

    expect(result).toEqual({ ok: true, data: { redirectTo: '/mfa/enroll' } });
  });

  it('answers a wrong address, a wrong password and a locked account with the same words', async () => {
    vi.mocked(signInWithPassword).mockResolvedValue({ ok: false, reason: 'refused' });

    expect(await signInAction(CREDENTIALS)).toEqual({
      ok: false,
      error: { code: 'UNAUTHENTICATED', message: copy.auth.signIn.failed },
    });
  });

  it('says so when Turnstile refused the token', async () => {
    vi.mocked(signInWithPassword).mockResolvedValue({ ok: false, reason: 'captcha' });

    expect(await signInAction(CREDENTIALS)).toMatchObject({
      error: { message: copy.auth.signIn.captchaFailed },
    });
  });

  it('stops before Supabase Auth once a limit is used up', async () => {
    vi.mocked(withinSignInLimits).mockResolvedValue(false);

    expect(await signInAction(CREDENTIALS)).toMatchObject({ error: { code: 'RATE_LIMITED' } });
    expect(signInWithPassword).not.toHaveBeenCalled();
  });

  it('refuses when the limiter cannot be reached (fail-closed)', async () => {
    vi.mocked(withinSignInLimits).mockRejectedValue(new Error('database unavailable'));

    expect(await signInAction(CREDENTIALS)).toMatchObject({ error: { code: 'INTERNAL' } });
    expect(signInWithPassword).not.toHaveBeenCalled();
  });

  it('refuses a request without a Turnstile token or with extra fields', async () => {
    expect(await signInAction({ ...CREDENTIALS, captchaToken: '' })).toMatchObject({
      error: { code: 'VALIDATION', fieldErrors: { captchaToken: [copy.auth.validation.captcha] } },
    });
    expect(await signInAction({ ...CREDENTIALS, role: 'superadmin' })).toMatchObject({
      error: { code: 'VALIDATION' },
    });
    expect(withinSignInLimits).not.toHaveBeenCalled();
  });
});

describe('requestPasswordResetAction', () => {
  const REQUEST = { email: ' A@B.test ', captchaToken: 't' };

  async function runScheduledWork(): Promise<void> {
    for (const [task] of vi.mocked(after).mock.calls) {
      if (typeof task === 'function') await task();
    }
  }

  // F1 of the PR #17 review: whether the address gets an email is decided after the answer has gone out, so the
  // answer's timing, headers and cookies are the same for every address.
  it('answers at once and only then looks at the address and sends the email', async () => {
    expect(await requestPasswordResetAction(REQUEST)).toEqual({ ok: true, data: null });
    expect(sendPasswordResetEmail).not.toHaveBeenCalled();

    await runScheduledWork();
    expect(sendPasswordResetEmail).toHaveBeenCalledWith('a@b.test', 'request-1');
  });

  it("checks the reset form's own Turnstile token, since the email goes out under the service role", async () => {
    vi.mocked(verifyTurnstile).mockResolvedValue(false);

    expect(await requestPasswordResetAction(REQUEST)).toMatchObject({
      error: { code: 'VALIDATION', message: copy.auth.signIn.captchaFailed },
    });
    expect(verifyTurnstile).toHaveBeenCalledWith('t', '203.0.113.7', 'password_reset');
    expect(after).not.toHaveBeenCalled();
  });

  it('answers the same, scheduling nothing, once a limit is used up', async () => {
    vi.mocked(withinPasswordResetLimits).mockResolvedValue(false);

    expect(await requestPasswordResetAction(REQUEST)).toEqual({ ok: true, data: null });
    expect(verifyTurnstile).not.toHaveBeenCalled();
    expect(after).not.toHaveBeenCalled();
  });

  it('refuses when the limiter cannot be reached (fail-closed)', async () => {
    vi.mocked(withinPasswordResetLimits).mockRejectedValue(new Error('database unavailable'));

    expect(await requestPasswordResetAction(REQUEST)).toMatchObject({
      error: { code: 'INTERNAL' },
    });
    expect(after).not.toHaveBeenCalled();
  });
});

describe('resetPasswordAction', () => {
  it('sets the password from a recovery session and sends the browser to sign in again', async () => {
    expect(await resetPasswordAction(NEW_PASSWORD)).toEqual({
      ok: true,
      data: { redirectTo: '/login?info=password-changed' },
    });
    expect(changePasswordAfterRecovery).toHaveBeenCalledWith(
      RECOVERY_SESSION,
      expect.objectContaining({ password: NEW_PASSWORD.password, totpCode: '123456' }),
    );
  });

  it('refuses a session a recovery link did not open', async () => {
    vi.mocked(readStaffSession).mockResolvedValue({
      ...RECOVERY_SESSION,
      authMethods: ['password', 'totp'],
    });

    expect(await resetPasswordAction(NEW_PASSWORD)).toMatchObject({
      error: { code: 'UNAUTHENTICATED' },
    });
    expect(changePasswordAfterRecovery).not.toHaveBeenCalled();
  });

  it('refuses before anything else when Turnstile does', async () => {
    vi.mocked(verifyTurnstile).mockResolvedValue(false);

    expect(await resetPasswordAction(NEW_PASSWORD)).toMatchObject({
      error: { code: 'VALIDATION' },
    });
    expect(readStaffSession).not.toHaveBeenCalled();
  });

  // S1 of the PR #17 review.
  it('records it and tells the staff member when other devices may still be signed in', async () => {
    vi.mocked(changePasswordAfterRecovery).mockResolvedValue('changed_sessions_remain');

    expect(await resetPasswordAction(NEW_PASSWORD)).toEqual({
      ok: true,
      data: { redirectTo: '/login?info=password-changed-sessions-remain' },
    });
    expect(recordSessionRevokeFailure).toHaveBeenCalledWith(
      RECOVERY_SESSION.ctx,
      'password_change',
      'request-1',
    );
  });

  it('sends an account without an authenticator to the superadmin', async () => {
    vi.mocked(changePasswordAfterRecovery).mockResolvedValue('no_factor');

    expect(await resetPasswordAction(NEW_PASSWORD)).toEqual({
      ok: false,
      error: { code: 'FORBIDDEN', message: 'Hubungi superadmin untuk memulihkan akun.' },
    });
  });

  it('puts a wrong code under the code field', async () => {
    vi.mocked(changePasswordAfterRecovery).mockResolvedValue('wrong_totp');

    expect(await resetPasswordAction(NEW_PASSWORD)).toMatchObject({
      error: { code: 'VALIDATION', fieldErrors: { totpCode: [copy.auth.mfa.failed] } },
    });
  });

  it('refuses a weak password and two passwords that differ', async () => {
    expect(
      await resetPasswordAction({ ...NEW_PASSWORD, password: 'short', confirmPassword: 'short' }),
    ).toMatchObject({
      error: { fieldErrors: { password: [copy.auth.validation.newPassword] } },
    });
    expect(
      await resetPasswordAction({ ...NEW_PASSWORD, confirmPassword: 'Different-Pass-3!' }),
    ).toMatchObject({
      error: { fieldErrors: { confirmPassword: [copy.auth.validation.passwordMismatch] } },
    });
  });
});
