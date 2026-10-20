'use server';

import { headers } from 'next/headers';
import { after } from 'next/server';

import {
  LOGIN_NOTICE_PARAM,
  LOGIN_PATH,
  RECOVERY_AUTH_METHOD,
  TURNSTILE_ACTIONS,
} from '@/config/auth';
import { copy } from '@/lib/copy/id';
import { fail, mapError, ok } from '@/lib/errors';
import { requestIdFrom } from '@/lib/logger';
import { verifyTurnstile } from '@/lib/turnstile';
import { clientIpFrom } from '@/lib/utils/client-ip';
import { mfaStepPath } from '@/lib/utils/staff-paths';
import { forgotPasswordSchema, resetPasswordSchema, signInSchema } from '@/lib/validations/auth';
import { readStaffSession } from '@/server/auth/guards';
import {
  changePasswordAfterRecovery,
  signInWithPassword,
  type PasswordChange,
  type PasswordSignIn,
} from '@/server/services/auth-service';
import {
  sendPasswordResetEmail,
  withinPasswordResetLimits,
  withinSignInLimits,
} from '@/server/services/staff-service';
import type { ActionResult } from '@/types/action-result';
import type { NextStep } from '@/types/auth';

// Staff sign-in (Task P2.8.01, docs/Security.md §5). The visitor has no session yet, so the guards are the limits
// and Turnstile: Supabase Auth checks the sign-in token itself, the two reset forms' tokens are checked here with
// verifyTurnstile. Messages never say whether an address belongs to an account (AUTH-06).

const text = copy.auth;

function signInFailure(reason: Exclude<PasswordSignIn, { ok: true }>['reason']) {
  if (reason === 'rate_limited') return fail('RATE_LIMITED');
  if (reason === 'captcha') return fail('VALIDATION', undefined, text.signIn.captchaFailed);
  return fail('UNAUTHENTICATED', undefined, text.signIn.failed);
}

// On success the browser goes on to the TOTP step; nothing is open before it (AUTH-03). The form navigates itself:
// a redirect thrown here would reject the promise the form awaits.
export async function signInAction(input: unknown): Promise<ActionResult<NextStep>> {
  const parsed = signInSchema.safeParse(input);
  if (!parsed.success) return mapError(parsed.error);

  try {
    if (!(await withinSignInLimits(clientIpFrom(await headers()), parsed.data.email))) {
      return fail('RATE_LIMITED');
    }
    const signIn = await signInWithPassword(parsed.data);
    if (!signIn.ok) return signInFailure(signIn.reason);
    return ok({ redirectTo: mfaStepPath(signIn.hasVerifiedTotp, parsed.data.next) });
  } catch (error) {
    return mapError(error);
  }
}

// The same answer for every address and for a used-up limit alike (docs/Security.md §5.1, §8.3 silent success).
// Nothing before the answer looks at the address itself: whether it gets an email is decided in after(), once the
// answer has gone out with the same headers, no cookie and the same timing (F1 of the PR #17 review). Only a refused
// Turnstile token or an outage, the same for every address, answers otherwise.
export async function requestPasswordResetAction(input: unknown): Promise<ActionResult<null>> {
  const parsed = forgotPasswordSchema.safeParse(input);
  if (!parsed.success) return mapError(parsed.error);
  const requestHeaders = await headers();
  const clientIp = clientIpFrom(requestHeaders);

  try {
    if (!(await withinPasswordResetLimits(clientIp, parsed.data.email))) return ok(null);
    const isHuman = await verifyTurnstile(
      parsed.data.captchaToken,
      clientIp,
      TURNSTILE_ACTIONS.passwordReset,
    );
    if (!isHuman) return fail('VALIDATION', undefined, text.signIn.captchaFailed);
  } catch (error) {
    return mapError(error);
  }

  const { email } = parsed.data;
  const requestId = requestIdFrom(requestHeaders);
  after(() => sendPasswordResetEmail(email, requestId));
  return ok(null);
}

const PASSWORD_CHANGE_FAILURES = {
  needs_totp: { field: 'totpCode', message: text.validation.totpCode },
  wrong_totp: { field: 'totpCode', message: text.mfa.failed },
  weak: { field: 'password', message: text.reset.weak },
  same: { field: 'password', message: text.reset.same },
} as const satisfies Record<Exclude<PasswordChange, 'changed' | 'no_factor'>, object>;

// The end of a recovery link: only a session that a recovery link opened may set a password here.
export async function resetPasswordAction(input: unknown): Promise<ActionResult<NextStep>> {
  const parsed = resetPasswordSchema.safeParse(input);
  if (!parsed.success) return mapError(parsed.error);
  const isHuman = await verifyTurnstile(
    parsed.data.captchaToken,
    clientIpFrom(await headers()),
    TURNSTILE_ACTIONS.passwordChange,
  );
  if (!isHuman) return fail('VALIDATION', undefined, text.signIn.captchaFailed);

  const session = await readStaffSession();
  if (!session?.authMethods.includes(RECOVERY_AUTH_METHOD)) return fail('UNAUTHENTICATED');
  if (session.ctx.role === 'none') return fail('FORBIDDEN');

  try {
    const outcome = await changePasswordAfterRecovery(session, parsed.data);
    if (outcome === 'no_factor') return fail('FORBIDDEN', undefined, text.reset.noFactor);
    if (outcome !== 'changed') {
      const { field, message } = PASSWORD_CHANGE_FAILURES[outcome];
      return fail('VALIDATION', { [field]: [message] }, message);
    }
    return ok({ redirectTo: `${LOGIN_PATH}?${LOGIN_NOTICE_PARAM}=password-changed` });
  } catch (error) {
    return mapError(error);
  }
}
