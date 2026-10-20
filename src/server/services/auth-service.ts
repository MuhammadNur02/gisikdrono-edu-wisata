import 'server-only';

import { isAuthApiError, type AuthError } from '@supabase/supabase-js';
import { z } from 'zod';

import { AUTH_CALLBACK_PATH, TOTP_ISSUER } from '@/config/auth';
import { AppError } from '@/lib/errors';
import { createLogger, requestIdFrom } from '@/lib/logger';
import { publicEnv } from '@/lib/public-env';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { StaffSession } from '@/server/auth/guards';
import { canResetPassword } from '@/server/services/staff-service';

// Staff sign-in through Supabase Auth with the session client (src/lib/supabase/server.ts): every call acts as
// whoever's cookies came with the request, and the session it opens or lifts is written back into those cookies.
// The limits and the account lookup that need the service role live in staff-service.ts.

export type PasswordSignIn =
  | { ok: true; hasVerifiedTotp: boolean }
  | { ok: false; reason: 'captcha' | 'rate_limited' | 'refused' };

export type PasswordChange = 'changed' | 'needs_totp' | 'wrong_totp' | 'weak' | 'same';

export type EnrolmentConfirmation = 'confirmed' | 'wrong_code' | 'expired';

const HTTP_TOO_MANY_REQUESTS = 429;
const HTTP_SERVER_ERROR = 500;
const CAPTCHA_FAILED = 'captcha_failed';
const SAME_PASSWORD = 'same_password';

const authMethodsSchema = z.array(z.object({ method: z.string() }));

// Supabase Auth's answer to the request itself (wrong password, wrong code, a refused captcha). Anything else, a
// network failure or a 5xx, is an outage and is thrown on, so it never reads as a wrong password.
function isRefusal(error: AuthError): boolean {
  return isAuthApiError(error) && error.status < HTTP_SERVER_ERROR;
}

function signInRefusal(error: AuthError): PasswordSignIn {
  if (!isRefusal(error)) throw error;
  if (error.code === CAPTCHA_FAILED) return { ok: false, reason: 'captcha' };
  if (error.status === HTTP_TOO_MANY_REQUESTS) return { ok: false, reason: 'rate_limited' };
  return { ok: false, reason: 'refused' };
}

// The captcha token goes to Supabase Auth, which checks it with Turnstile itself (docs/Security.md §5.5).
export async function signInWithPassword(credentials: {
  email: string;
  password: string;
  captchaToken: string;
}): Promise<PasswordSignIn> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: credentials.email,
    password: credentials.password,
    options: { captchaToken: credentials.captchaToken },
  });
  if (error) return signInRefusal(error);
  const factors = data.user.factors ?? [];
  return {
    ok: true,
    hasVerifiedTotp: factors.some((f) => f.factor_type === 'totp' && f.status === 'verified'),
  };
}

// Sends the reset email only to an account that may reset (staff-service.ts). Every failure is logged and kept here,
// because an answer that differed by address would tell which addresses are staff (docs/Security.md §5.1).
export async function sendPasswordReset(
  request: { email: string; captchaToken: string },
  requestHeaders: Headers,
): Promise<void> {
  if (!(await canResetPassword(request.email))) return;
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.resetPasswordForEmail(request.email, {
    redirectTo: new URL(AUTH_CALLBACK_PATH, publicEnv.NEXT_PUBLIC_SITE_URL).toString(),
    captchaToken: request.captchaToken,
  });
  if (error) {
    createLogger(requestIdFrom(requestHeaders)).warn('internal_error', {
      source: 'password_reset',
      authErrorCode: error.code ?? null,
    });
  }
}

// Lifts the session to AAL2 with the code of the account's verified TOTP factor. False for a wrong or stale code.
export async function verifyTotp(code: string): Promise<boolean> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.mfa.listFactors();
  if (error) throw error;
  const [factor] = data.totp;
  if (!factor) return false;
  const verified = await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code });
  if (verified.error && !isRefusal(verified.error)) throw verified.error;
  return verified.error === null;
}

type SessionClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

// docs/Security.md §5.2 (AUTH-12): exactly one verified factor per account, so a second one is never enrolled here;
// replacing a factor goes through reset_staff_mfa.
async function pendingTotpFactorIds(supabase: SessionClient): Promise<string[]> {
  const { data, error } = await supabase.auth.mfa.listFactors();
  if (error) throw error;
  if (data.totp.length > 0) throw new AppError('CONFLICT');
  return data.all
    .filter((factor) => factor.factor_type === 'totp' && factor.status === 'unverified')
    .map((factor) => factor.id);
}

// Starts the enrolment of the account's first factor (Task P2.8.02). A half-finished one is removed first, so a QR
// code that was shown and abandoned never becomes usable later.
export async function startTotpEnrolment(): Promise<{
  factorId: string;
  secret: string;
  uri: string;
}> {
  const supabase = await createSupabaseServerClient();
  const abandoned = await pendingTotpFactorIds(supabase);
  const removals = await Promise.all(
    abandoned.map((factorId) => supabase.auth.mfa.unenroll({ factorId })),
  );
  const removalError = removals.find((removal) => removal.error !== null)?.error;
  if (removalError) throw removalError;

  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: 'totp',
    issuer: TOTP_ISSUER,
  });
  if (error) throw error;
  return { factorId: data.id, secret: data.totp.secret, uri: data.totp.uri };
}

// The first code confirms the factor and lifts the session to AAL2. A factor that is no longer pending (replaced by
// a newer QR code, or removed) is `expired`.
export async function confirmTotpEnrolment(
  factorId: string,
  code: string,
): Promise<EnrolmentConfirmation> {
  const supabase = await createSupabaseServerClient();
  if (!(await pendingTotpFactorIds(supabase)).includes(factorId)) return 'expired';
  const verified = await supabase.auth.mfa.challengeAndVerify({ factorId, code });
  if (verified.error && !isRefusal(verified.error)) throw verified.error;
  return verified.error === null ? 'confirmed' : 'wrong_code';
}

// The end of a recovery link (Task P2.8.01): Supabase Auth changes the password of an account with a factor only at
// AAL2, so the code comes first. Every session of the account is ended afterwards, this one included.
export async function changePasswordAfterRecovery(
  session: StaffSession,
  change: { password: string; totpCode?: string | undefined },
): Promise<PasswordChange> {
  if (session.hasVerifiedTotp && !session.ctx.isAal2) {
    if (change.totpCode === undefined) return 'needs_totp';
    if (!(await verifyTotp(change.totpCode))) return 'wrong_totp';
  }
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.updateUser({ password: change.password });
  if (error) {
    if (!isRefusal(error)) throw error;
    // Too weak, or found among leaked passwords.
    return error.code === SAME_PASSWORD ? 'same' : 'weak';
  }
  await supabase.auth.signOut({ scope: 'global' });
  return 'changed';
}

// The code of a recovery or confirmation link (PKCE). Null when it is expired or used, or when the link was opened in
// another browser, which does not hold the verifier the request started with.
export async function exchangeAuthCode(code: string): Promise<{ isRecovery: boolean } | null> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return null;
  // A recovery link opens a session whose verified token says so in amr, as /reset-password checks.
  const { data } = await supabase.auth.getClaims();
  const methods = authMethodsSchema.safeParse(data?.claims.amr);
  return {
    isRecovery: methods.success && methods.data.some((entry) => entry.method === 'recovery'),
  };
}

// docs/Security.md §5.4: sign-out ends every session of the account, not only this browser's.
export async function signOutEverywhere(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut({ scope: 'global' });
}
