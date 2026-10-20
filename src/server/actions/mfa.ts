'use server';

import { headers } from 'next/headers';

import { copy } from '@/lib/copy/id';
import { fail, mapError, ok } from '@/lib/errors';
import { createLogger, requestIdFrom } from '@/lib/logger';
import { verifyTurnstile } from '@/lib/turnstile';
import { clientIpFrom } from '@/lib/utils/client-ip';
import { qrSvgPath } from '@/lib/utils/qr-path';
import { staffNextPath } from '@/lib/utils/staff-paths';
import { confirmMfaEnrolmentSchema, verifyMfaSchema } from '@/lib/validations/mfa';
import { requireUser } from '@/server/auth/guards';
import {
  confirmTotpEnrolment,
  startTotpEnrolment,
  verifyTotp,
} from '@/server/services/auth-service';
import type { ActionResult } from '@/types/action-result';
import type { NextStep, TotpEnrolment } from '@/types/auth';

// The TOTP step of staff sign-in (Task P2.8.02, docs/Security.md §5.2, AUTH-03). requireUser() lets an AAL1 session
// in, which is what these steps are for, and keeps out an account without a staff role. A wrong code is logged by the
// staff member's id only.

const text = copy.auth;

export async function verifyMfaAction(input: unknown): Promise<ActionResult<NextStep>> {
  const parsed = verifyMfaSchema.safeParse(input);
  if (!parsed.success) return mapError(parsed.error);
  const requestHeaders = await headers();
  const isHuman = await verifyTurnstile(parsed.data.captchaToken, clientIpFrom(requestHeaders));
  if (!isHuman) return fail('VALIDATION', undefined, text.signIn.captchaFailed);
  const guard = await requireUser();
  if (!guard.ok) return guard;

  try {
    if (!guard.ctx.isAal2 && !(await verifyTotp(parsed.data.code))) {
      createLogger(requestIdFrom(requestHeaders)).warn('mfa_failed', { userId: guard.ctx.userId });
      return fail('VALIDATION', { code: [text.mfa.failed] }, text.mfa.failed);
    }
    return ok({ redirectTo: staffNextPath(parsed.data.next) });
  } catch (error) {
    return mapError(error);
  }
}

// Only for an account without a verified factor: a second one is never added here (AUTH-12).
export async function startMfaEnrolmentAction(): Promise<ActionResult<TotpEnrolment>> {
  const guard = await requireUser();
  if (!guard.ok) return guard;

  try {
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
  const guard = await requireUser();
  if (!guard.ok) return guard;

  try {
    const outcome = await confirmTotpEnrolment(parsed.data.factorId, parsed.data.code);
    if (outcome === 'expired') return fail('STATE_INVALID', undefined, text.mfa.enrollExpired);
    if (outcome === 'wrong_code')
      return fail('VALIDATION', { code: [text.mfa.failed] }, text.mfa.failed);
    createLogger(requestIdFrom(await headers())).info('mfa_enrolled', { userId: guard.ctx.userId });
    return ok({ redirectTo: staffNextPath(parsed.data.next) });
  } catch (error) {
    return mapError(error);
  }
}
