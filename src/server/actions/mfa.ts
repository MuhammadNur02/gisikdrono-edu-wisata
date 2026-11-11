'use server';

import { headers } from 'next/headers';

import { TURNSTILE_ACTIONS } from '@/config/auth';
import { copy } from '@/lib/copy/id';
import { fail, mapError, ok } from '@/lib/errors';
import { createLogger, requestIdFrom } from '@/lib/logger';
import { reenrolmentCodeHash } from '@/lib/staff-codes';
import { verifyTurnstile } from '@/lib/turnstile';
import { clientIpFrom } from '@/lib/utils/client-ip';
import { qrSvgPath } from '@/lib/utils/qr-path';
import { staffNextPath } from '@/lib/utils/staff-paths';
import {
  confirmMfaEnrolmentSchema,
  startMfaEnrolmentSchema,
  verifyMfaSchema,
} from '@/lib/validations/mfa';
import { readStaffSession, requireUser } from '@/server/auth/guards';
import {
  confirmTotpEnrolment,
  startTotpEnrolment,
  verifyTotp,
} from '@/server/services/auth-service';
import {
  reenrolmentStateOf,
  spendReenrolmentCode,
  type ReenrolmentState,
} from '@/server/services/staff-service';
import type { ActionFailure, ActionResult } from '@/types/action-result';
import type { NextStep, TotpEnrolment } from '@/types/auth';

// The TOTP step of staff sign-in (Task P2.8.02, docs/Security.md §5.2, AUTH-03). requireUser() lets an AAL1 session
// in, which is what these steps are for, and keeps out an account without a staff role. A wrong code is logged by the
// staff member's id only.

const text = copy.auth;

export async function verifyMfaAction(input: unknown): Promise<ActionResult<NextStep>> {
  const parsed = verifyMfaSchema.safeParse(input);
  if (!parsed.success) return mapError(parsed.error);
  const requestHeaders = await headers();
  const isHuman = await verifyTurnstile(
    parsed.data.captchaToken,
    clientIpFrom(requestHeaders),
    TURNSTILE_ACTIONS.mfaVerify,
  );
  if (!isHuman) return fail('VALIDATION', undefined, text.signIn.captchaFailed);
  const guard = await requireUser();
  if (!guard.ok) return guard;

  try {
    const check = guard.ctx.isAal2 ? 'verified' : await verifyTotp(parsed.data.code);
    if (check !== 'verified') {
      const event = check === 'locked' ? 'mfa_locked' : 'mfa_failed';
      createLogger(requestIdFrom(requestHeaders)).warn(event, { userId: guard.ctx.userId });
    }
    if (check === 'locked') return fail('RATE_LIMITED', undefined, text.mfa.locked);
    if (check === 'wrong_code')
      return fail('VALIDATION', { code: [text.mfa.failed] }, text.mfa.failed);
    return ok({ redirectTo: staffNextPath(parsed.data.next) });
  } catch (error) {
    return mapError(error);
  }
}

type EnrolmentGuard =
  | { ok: true; userId: string; reenrolment: Exclude<ReenrolmentState, 'none'> | null }
  | ActionFailure;

// Task P4.8.05: the enrolment steps are a staff account's, and also those of an account that waits for a new
// authenticator after an MFA reset, whose token carries no role until its new factor is verified.
async function requireEnrollingUser(): Promise<EnrolmentGuard> {
  const staff = await requireUser();
  if (staff.ok) return { ok: true, userId: staff.ctx.userId, reenrolment: null };
  const session = await readStaffSession();
  if (session?.ctx.role !== 'none') return staff;
  const state = await reenrolmentStateOf(session.ctx.userId);
  return state === 'none' ? staff : { ok: true, userId: session.ctx.userId, reenrolment: state };
}

// The code is used in one call, which counts toward its five tries an hour, never checked first (re-review of PR
// #58); a right one opens ten minutes to verify the new factor in, so a QR code made again in that time needs none.
async function openReenrolment(
  guard: EnrolmentGuard & { ok: true },
  code: string | undefined,
): Promise<ActionFailure | null> {
  if (guard.reenrolment !== 'needs_code') return null;
  const wrongCode = fail('VALIDATION', { reenrolmentCode: [text.mfa.reenrolCodeWrong] });
  if (code === undefined) return wrongCode;
  return (await spendReenrolmentCode(guard.userId, reenrolmentCodeHash(code))) ? null : wrongCode;
}

// Only for an account without a verified factor: a second one is never added here (AUTH-12).
export async function startMfaEnrolmentAction(
  input: unknown = {},
): Promise<ActionResult<TotpEnrolment>> {
  const parsed = startMfaEnrolmentSchema.safeParse(input);
  if (!parsed.success) return mapError(parsed.error);
  const guard = await requireEnrollingUser();
  if (!guard.ok) return guard;

  try {
    const refused = await openReenrolment(guard, parsed.data.reenrolmentCode);
    if (refused) return refused;
    const enrolment = await startTotpEnrolment();
    return ok({
      factorId: enrolment.factorId,
      secret: enrolment.secret,
      qr: qrSvgPath(enrolment.uri),
    });
  } catch (error) {
    return mapError(error);
  }
}

export async function confirmMfaEnrolmentAction(input: unknown): Promise<ActionResult<NextStep>> {
  const parsed = confirmMfaEnrolmentSchema.safeParse(input);
  if (!parsed.success) return mapError(parsed.error);
  const guard = await requireEnrollingUser();
  if (!guard.ok) return guard;

  try {
    const outcome = await confirmTotpEnrolment(parsed.data.factorId, parsed.data.code);
    if (outcome === 'expired') return fail('STATE_INVALID', undefined, text.mfa.enrollExpired);
    if (outcome === 'duplicate') return fail('CONFLICT', undefined, text.mfa.enrollDuplicate);
    if (outcome === 'locked') return fail('RATE_LIMITED', undefined, text.mfa.locked);
    if (outcome === 'wrong_code')
      return fail('VALIDATION', { code: [text.mfa.failed] }, text.mfa.failed);
    createLogger(requestIdFrom(await headers())).info('mfa_enrolled', { userId: guard.userId });
    return ok({ redirectTo: staffNextPath(parsed.data.next) });
  } catch (error) {
    return mapError(error);
  }
}
