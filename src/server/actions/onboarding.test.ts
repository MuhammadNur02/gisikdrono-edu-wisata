import { beforeEach, describe, expect, it, vi } from 'vitest';

import { copy } from '@/lib/copy/id';
import { requireOnboardingUser, type OnboardingContext } from '@/server/auth/guards';
import {
  startOnboardingCompletion,
  startTotpEnrolment,
  type OnboardingCompletion,
} from '@/server/services/auth-service';
import { acceptInviteForSession, claimInviteForSession } from '@/server/services/staff-service';

import { claimInviteAction, completeOnboardingAction } from './onboarding';

vi.mock('next/headers', () => ({ headers: () => Promise.resolve(new Headers()) }));
vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
  requestIdFrom: () => 'request-1',
}));
vi.mock('@/lib/staff-codes', () => ({ inviteCodeHash: (code: string) => `hash:${code}` }));
vi.mock('@/lib/utils/qr-path', () => ({ qrSvgPath: () => ({ size: 29, path: 'M0 0' }) }));
vi.mock('@/server/auth/guards', () => ({ requireOnboardingUser: vi.fn() }));
vi.mock('@/server/services/auth-service', () => ({
  startOnboardingCompletion: vi.fn(),
  startTotpEnrolment: vi.fn(),
}));
vi.mock('@/server/services/staff-service', () => ({
  acceptInviteForSession: vi.fn(),
  claimInviteForSession: vi.fn(),
}));

const SESSION_ID = '5b0c1d2e-3f4a-4b5c-8d6e-0123456789ab';
const INVITE_CODE = 'ABCDE-FGHJK-MNPQR-STVWX';
const MAILBOX: OnboardingContext = {
  userId: 'user-1',
  sessionId: SESSION_ID,
  isAal2: false,
  hasTotpMethod: false,
  verifiedFactorCount: 0,
};
const LIFTED: OnboardingContext = {
  ...MAILBOX,
  isAal2: true,
  hasTotpMethod: true,
  verifiedFactorCount: 1,
};
const COMPLETE = {
  inviteCode: INVITE_CODE,
  totpCode: '123456',
  password: 'Petugas-baru-2026!',
  confirmPassword: 'Petugas-baru-2026!',
};

const steps = {
  verifyFactor: vi.fn<OnboardingCompletion['verifyFactor']>(),
  readSession: vi.fn<OnboardingCompletion['readSession']>(),
  setPassword: vi.fn<OnboardingCompletion['setPassword']>(),
  end: vi.fn<OnboardingCompletion['end']>(),
};

beforeEach(() => {
  vi.mocked(requireOnboardingUser).mockReset().mockResolvedValue({ ok: true, ctx: MAILBOX });
  vi.mocked(claimInviteForSession).mockReset().mockResolvedValue(true);
  vi.mocked(acceptInviteForSession).mockReset().mockResolvedValue(true);
  vi.mocked(startTotpEnrolment)
    .mockReset()
    .mockResolvedValue({ factorId: 'factor-1', secret: 'SECRET', uri: 'otpauth://totp/x' });
  steps.verifyFactor.mockReset().mockResolvedValue('verified');
  steps.readSession.mockReset().mockResolvedValue({ ok: true, ctx: LIFTED });
  steps.setPassword.mockReset().mockResolvedValue('set');
  steps.end.mockReset().mockResolvedValue(undefined);
  vi.mocked(startOnboardingCompletion).mockReset().mockResolvedValue(steps);
});

describe('claimInviteAction', () => {
  it('claims the invite for this session before any QR code, by the hash of the code only', async () => {
    const result = await claimInviteAction({ inviteCode: INVITE_CODE });

    expect(claimInviteForSession).toHaveBeenCalledWith(
      { userId: 'user-1', sessionId: SESSION_ID },
      `hash:${INVITE_CODE}`,
    );
    expect(vi.mocked(claimInviteForSession).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(startTotpEnrolment).mock.invocationCallOrder[0] ?? 0,
    );
    expect(result).toMatchObject({
      ok: true,
      data: { kind: 'enrol', enrolment: { factorId: 'factor-1' } },
    });
  });

  it('shows no QR code when the code is refused, with one answer for every reason', async () => {
    vi.mocked(claimInviteForSession).mockResolvedValue(false);

    expect(await claimInviteAction({ inviteCode: INVITE_CODE })).toEqual({
      ok: false,
      error: { code: 'FORBIDDEN', message: copy.auth.onboarding.claimFailed },
    });
    expect(startTotpEnrolment).not.toHaveBeenCalled();
  });

  it('asks only for the code of an authenticator verified in an earlier, interrupted onboarding', async () => {
    vi.mocked(requireOnboardingUser).mockResolvedValue({
      ok: true,
      ctx: { ...MAILBOX, verifiedFactorCount: 1 },
    });

    expect(await claimInviteAction({ inviteCode: INVITE_CODE })).toEqual({
      ok: true,
      data: { kind: 'verify' },
    });
    expect(startTotpEnrolment).not.toHaveBeenCalled();
  });

  it('refuses a code of the wrong shape, and anyone the onboarding guard refuses, before the database', async () => {
    expect((await claimInviteAction({ inviteCode: 'ABC' })).ok).toBe(false);
    vi.mocked(requireOnboardingUser).mockResolvedValue({
      ok: false,
      error: { code: 'FORBIDDEN', message: 'x' },
    });
    expect((await claimInviteAction({ inviteCode: INVITE_CODE })).ok).toBe(false);
    expect(claimInviteForSession).not.toHaveBeenCalled();
  });

  it('reads an outage like a refusal, never as a database outcome', async () => {
    vi.mocked(claimInviteForSession).mockRejectedValue(
      Object.assign(new Error('boom'), { code: 'P0001', hint: 'STATE_INVALID' }),
    );

    expect(await claimInviteAction({ inviteCode: INVITE_CODE })).toEqual({
      ok: false,
      error: { code: 'FORBIDDEN', message: copy.auth.onboarding.claimFailed },
    });
  });
});

describe('completeOnboardingAction', () => {
  it('goes code, factor, password at AAL2, then acceptance, and ends the session', async () => {
    const result = await completeOnboardingAction(COMPLETE);

    expect(result).toEqual({ ok: true, data: { redirectTo: '/login?info=onboarding-done' } });
    expect(steps.verifyFactor).toHaveBeenCalledWith('123456');
    expect(steps.setPassword).toHaveBeenCalledWith('Petugas-baru-2026!');
    expect(acceptInviteForSession).toHaveBeenCalledWith(
      { userId: 'user-1', sessionId: SESSION_ID },
      `hash:${INVITE_CODE}`,
    );
    const order = [steps.verifyFactor, steps.readSession, steps.setPassword].map(
      (step) => step.mock.invocationCallOrder[0] ?? 0,
    );
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(steps.setPassword.mock.invocationCallOrder[0] ?? 0).toBeLessThan(
      vi.mocked(acceptInviteForSession).mock.invocationCallOrder[0] ?? 0,
    );
    expect(steps.end).toHaveBeenCalled();
  });

  it.each([
    ['not at AAL2', { ...LIFTED, isAal2: false }],
    ['lifted without a TOTP code', { ...LIFTED, hasTotpMethod: false }],
    ['another session than the one that claimed', { ...LIFTED, sessionId: 'another-session' }],
    ['with two verified factors', { ...LIFTED, verifiedFactorCount: 2 }],
  ])('never sets the password of a session %s', async (_case, lifted) => {
    steps.readSession.mockResolvedValue({ ok: true, ctx: lifted });

    expect(await completeOnboardingAction(COMPLETE)).toMatchObject({
      ok: false,
      error: { code: 'FORBIDDEN', message: copy.auth.onboarding.completeFailed },
    });
    expect(steps.setPassword).not.toHaveBeenCalled();
    expect(acceptInviteForSession).not.toHaveBeenCalled();
  });

  it('puts a wrong code under its field and sets nothing', async () => {
    steps.verifyFactor.mockResolvedValue('wrong_code');

    expect(await completeOnboardingAction(COMPLETE)).toMatchObject({
      error: { code: 'VALIDATION', fieldErrors: { totpCode: [copy.auth.mfa.failed] } },
    });
    expect(steps.setPassword).not.toHaveBeenCalled();
  });

  it('puts a weak password under its field before the code is consumed', async () => {
    steps.setPassword.mockResolvedValue('weak');

    expect(await completeOnboardingAction(COMPLETE)).toMatchObject({
      error: { code: 'VALIDATION', fieldErrors: { password: [copy.auth.reset.weak] } },
    });
    expect(acceptInviteForSession).not.toHaveBeenCalled();
  });

  it('reads a refused acceptance, and a factor the database would not verify, as the one generic refusal', async () => {
    vi.mocked(acceptInviteForSession).mockResolvedValue(false);
    expect(await completeOnboardingAction(COMPLETE)).toMatchObject({
      error: { code: 'FORBIDDEN', message: copy.auth.onboarding.completeFailed },
    });
    expect(steps.end).not.toHaveBeenCalled();

    steps.verifyFactor.mockRejectedValue(new Error('Database error verifying factor'));
    expect(await completeOnboardingAction(COMPLETE)).toMatchObject({
      error: { code: 'FORBIDDEN', message: copy.auth.onboarding.completeFailed },
    });
  });

  it('refuses mismatched passwords before any step', async () => {
    expect(
      (await completeOnboardingAction({ ...COMPLETE, confirmPassword: 'Lain-sama-sekali-2026!' }))
        .ok,
    ).toBe(false);
    expect(startOnboardingCompletion).not.toHaveBeenCalled();
  });
});
