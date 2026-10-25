'use server';

import { headers } from 'next/headers';

import { LOGIN_NOTICE_PARAM, LOGIN_PATH } from '@/config/auth';
import { copy } from '@/lib/copy/id';
import { fail, mapError, ok } from '@/lib/errors';
import { createLogger, requestIdFrom } from '@/lib/logger';
import { inviteCodeHash } from '@/lib/staff-codes';
import { qrSvgPath } from '@/lib/utils/qr-path';
import { claimInviteSchema, completeOnboardingSchema } from '@/lib/validations/onboarding';
import { requireOnboardingUser, type OnboardingContext } from '@/server/auth/guards';
import {
  startOnboardingCompletion,
  startTotpEnrolment,
  type OnboardingCompletion,
} from '@/server/services/auth-service';
import { acceptInviteForSession, claimInviteForSession } from '@/server/services/staff-service';
import type { ActionFailure, ActionResult } from '@/types/action-result';
import type { NextStep, OnboardingFactorStep } from '@/types/auth';

// /onboarding (Task P4.8.01, docs/Security.md §5.1, §5.2): the invite code first, claimed for this session before any
// QR code; then the authenticator, which lifts the session to AAL2; then the password, at AAL2; then the acceptance,
// which consumes the code and ends every session. Every refusal of the code reads the same, whatever the database
// found, and an outage reads as one: nothing from mapError's STATE_INVALID path reaches this page. The code is never
// logged.

const text = copy.auth.onboarding;

function refused(message: string): ActionFailure {
  return fail('FORBIDDEN', undefined, message);
}

async function logFailure(source: string, userId: string, error: unknown): Promise<ActionFailure> {
  createLogger(requestIdFrom(await headers())).error('internal_error', {
    source,
    userId,
    errorName: error instanceof Error ? error.name : typeof error,
  });
  return fail('INTERNAL');
}

async function factorStepFor(ctx: OnboardingContext): Promise<OnboardingFactorStep> {
  if (ctx.verifiedFactorCount > 0) return { kind: 'verify' };
  const enrolment = await startTotpEnrolment();
  return {
    kind: 'enrol',
    enrolment: {
      factorId: enrolment.factorId,
      secret: enrolment.secret,
      qr: qrSvgPath(enrolment.uri),
    },
  };
}

export async function claimInviteAction(
  input: unknown,
): Promise<ActionResult<OnboardingFactorStep>> {
  const parsed = claimInviteSchema.safeParse(input);
  if (!parsed.success) return mapError(parsed.error);
  const guard = await requireOnboardingUser();
  if (!guard.ok) return guard;
  const session = { userId: guard.ctx.userId, sessionId: guard.ctx.sessionId };

  try {
    if (!(await claimInviteForSession(session, inviteCodeHash(parsed.data.inviteCode)))) {
      createLogger(requestIdFrom(await headers())).warn('login_failed', {
        userId: session.userId,
        step: 'invite_claim',
      });
      return refused(text.claimFailed);
    }
    createLogger(requestIdFrom(await headers())).info('invite_claimed', { userId: session.userId });
    return ok(await factorStepFor(guard.ctx));
  } catch (error) {
    return logFailure('onboarding_claim', session.userId, error);
  }
}

// After the factor: this very session at AAL2 from a TOTP code, with exactly one verified factor (finding 1 of the
// onboarding review). accept_staff_invite checks the same in the database.
function isLiftedClaimingSession(lifted: OnboardingContext, claiming: OnboardingContext): boolean {
  return (
    lifted.isAal2 &&
    lifted.hasTotpMethod &&
    lifted.sessionId === claiming.sessionId &&
    lifted.userId === claiming.userId &&
    lifted.verifiedFactorCount === 1
  );
}

type CompletionValues = { totpCode: string; password: string };

// The factor, then the password at AAL2: null once both are done, else what the page shows.
async function liftAndSetPassword(
  steps: OnboardingCompletion,
  values: CompletionValues,
  claiming: OnboardingContext,
): Promise<ActionFailure | null> {
  const check = await steps.verifyFactor(values.totpCode);
  if (check === 'locked') return fail('RATE_LIMITED', undefined, copy.auth.mfa.locked);
  if (check === 'wrong_code') {
    return fail('VALIDATION', { totpCode: [copy.auth.mfa.failed] }, copy.auth.mfa.failed);
  }
  if (check === 'no_factor') return refused(text.completeFailed);
  const lifted = await steps.readSession();
  if (!lifted.ok || !isLiftedClaimingSession(lifted.ctx, claiming))
    return refused(text.completeFailed);
  if ((await steps.setPassword(values.password)) === 'weak') {
    return fail('VALIDATION', { password: [copy.auth.reset.weak] }, copy.auth.reset.weak);
  }
  return null;
}

export async function completeOnboardingAction(input: unknown): Promise<ActionResult<NextStep>> {
  const parsed = completeOnboardingSchema.safeParse(input);
  if (!parsed.success) return mapError(parsed.error);
  const guard = await requireOnboardingUser();
  if (!guard.ok) return guard;
  const session = { userId: guard.ctx.userId, sessionId: guard.ctx.sessionId };

  try {
    const steps = await startOnboardingCompletion();
    const failure = await liftAndSetPassword(steps, parsed.data, guard.ctx);
    if (failure) return failure;
    if (!(await acceptInviteForSession(session, inviteCodeHash(parsed.data.inviteCode)))) {
      return refused(text.completeFailed);
    }
    await steps.end();
    createLogger(requestIdFrom(await headers())).info('role_changed', {
      userId: session.userId,
      flow: 'onboarding',
    });
    return ok({ redirectTo: `${LOGIN_PATH}?${LOGIN_NOTICE_PARAM}=onboarding-done` });
  } catch (error) {
    // A factor the database refused to verify (no claim held) comes back from Supabase Auth as an error.
    await logFailure('onboarding_complete', session.userId, error);
    return refused(text.completeFailed);
  }
}
