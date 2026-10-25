import 'server-only';

import { isAuthApiError, type AuthError } from '@supabase/supabase-js';

import { TOTP_ISSUER } from '@/config/auth';
import { readOnboardingState, type OnboardingState } from '@/db/rpc-onboarding';
import { AppError } from '@/lib/errors';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { StaffSession } from '@/server/auth/guards';
import {
  readOnboardingContext,
  type OnboardingGuardResult,
} from '@/server/auth/onboarding-context';

// Staff sign-in through Supabase Auth with the session client (src/lib/supabase/server.ts): every call acts as
// whoever's cookies came with the request, and the session it opens or lifts is written back into those cookies.
// The limits, the account lookup and the reset email, which need the service role, live in staff-service.ts.

export type PasswordSignIn =
  | { ok: true; hasVerifiedTotp: boolean }
  | { ok: false; reason: 'captcha' | 'rate_limited' | 'refused' };

export type TotpCheck = 'verified' | 'wrong_code' | 'locked';

export type PasswordChange =
  | 'changed'
  | 'changed_sessions_remain'
  | 'no_factor'
  | 'needs_totp'
  | 'wrong_totp'
  | 'totp_locked'
  | 'weak'
  | 'same';

export type EnrolmentConfirmation = 'confirmed' | 'duplicate' | 'wrong_code' | 'locked' | 'expired';

const HTTP_TOO_MANY_REQUESTS = 429;
const HTTP_SERVER_ERROR = 500;
const CAPTCHA_FAILED = 'captcha_failed';
const SAME_PASSWORD = 'same_password';
const MFA_LOCKED = 'mfa_verification_rejected';

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

// Supabase Auth's answer to a TOTP code. Where the MFA hook of 20261020080100 runs (the local stack; the hosted Pro
// projects have none), it refuses every code while the account is locked after too many wrong ones (M1 of the PR #17
// review), which reads apart from a wrong code.
function totpCheck(error: AuthError | null): TotpCheck {
  if (!error) return 'verified';
  if (!isRefusal(error)) throw error;
  return error.code === MFA_LOCKED ? 'locked' : 'wrong_code';
}

// Lifts the session to AAL2 with the code of the account's verified TOTP factor.
export async function verifyTotp(code: string): Promise<TotpCheck> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.mfa.listFactors();
  if (error) throw error;
  const [factor] = data.totp;
  if (!factor) return 'wrong_code';
  const verified = await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code });
  return totpCheck(verified.error);
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
// M3 of the PR #17 review: two enrolments started before either was confirmed both pass pendingTotpFactorIds, so a
// confirmed factor is checked once more. Supabase Auth removes the other pending factors when one is confirmed, and
// with two confirmations at the same moment it kept one of them itself (measured on the local stack), which may be
// the other one. Should two verified factors ever remain, the one enrolled first stays, which both racing requests
// agree on, so exactly one is left (AUTH-12).
async function settleEnrolmentRace(
  supabase: SessionClient,
  factorId: string,
): Promise<'confirmed' | 'duplicate'> {
  const { data, error } = await supabase.auth.mfa.listFactors();
  if (error) throw error;
  if (!data.totp.some((factor) => factor.id === factorId)) return 'duplicate';
  const [firstEnrolled] = [...data.totp].sort(
    (a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id),
  );
  if (firstEnrolled?.id === factorId) return 'confirmed';

  const removed = await supabase.auth.mfa.unenroll({ factorId });
  if (removed.error) throw removed.error;
  return 'duplicate';
}

// The first code confirms the factor and lifts the session to AAL2. A factor that is no longer pending (replaced by
// a newer QR code, or removed) is `expired`; one that lost the race to another enrolment is removed, `duplicate`.
export async function confirmTotpEnrolment(
  factorId: string,
  code: string,
): Promise<EnrolmentConfirmation> {
  const supabase = await createSupabaseServerClient();
  if (!(await pendingTotpFactorIds(supabase)).includes(factorId)) return 'expired';
  const verified = await supabase.auth.mfa.challengeAndVerify({ factorId, code });
  const check = totpCheck(verified.error);
  if (check !== 'verified') return check;
  return settleEnrolmentRace(supabase, factorId);
}

// The end of a recovery link (Task P2.8.01): Supabase Auth changes the password of an account with a factor only at
// AAL2, so the code comes first. An account without a verified factor would set a password with its mailbox alone,
// so it is refused and goes to the superadmin (M2 of the PR #17 review, risk R24). Every session of the account is
// ended afterwards, this one included; `changed_sessions_remain` when Supabase Auth could not end the others (S1).
export async function changePasswordAfterRecovery(
  session: StaffSession,
  change: { password: string; totpCode?: string | undefined },
): Promise<PasswordChange> {
  if (!session.hasVerifiedTotp) return 'no_factor';
  if (!session.ctx.isAal2) {
    if (change.totpCode === undefined) return 'needs_totp';
    const check = await verifyTotp(change.totpCode);
    if (check !== 'verified') return check === 'locked' ? 'totp_locked' : 'wrong_totp';
  }
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.updateUser({ password: change.password });
  if (error) {
    if (!isRefusal(error)) throw error;
    // Too weak, or found among leaked passwords.
    return error.code === SAME_PASSWORD ? 'same' : 'weak';
  }
  const signedOut = await supabase.auth.signOut({ scope: 'global' });
  return signedOut.error ? 'changed_sessions_remain' : 'changed';
}

export type EmailLinkType = 'recovery' | 'invite';

// The token_hash of a recovery or invite email (docs/Security.md §5.1). A recovery link opens a session whose verified
// token names `otp` in amr, as /reset-password checks; an invite link (Task P4.8.01) opens one for the mailbox, which
// /onboarding takes no further without the invite code. False when the link is used or expired; an outage is thrown
// on, so it never reads as an expired link.
export async function openEmailLinkSession(
  type: EmailLinkType,
  tokenHash: string,
): Promise<boolean> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
  if (error && !isRefusal(error)) throw error;
  return error === null;
}

// docs/Security.md §5.4: sign-out ends every session of the account, not only this browser's. False when Supabase
// Auth could not end them (S1 of the PR #17 review): auth-js clears this browser's cookies on any error, so only the
// other devices may still be signed in.
export async function signOutEverywhere(): Promise<boolean> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signOut({ scope: 'global' });
  return error === null;
}

export type OnboardingFactorCheck = TotpCheck | 'no_factor';
export type OnboardingPassword = 'set' | 'weak';

// /onboarding (Task P4.8.01): the account's one factor, verified if it already is (an onboarding that stopped after
// this step), else the one this session just enrolled. Its code lifts the session to AAL2; for a pending factor it
// is also the code that verifies it, which the database allows only under the session's claim (20261103131000).
async function verifyOnboardingFactor(
  supabase: SessionClient,
  code: string,
): Promise<OnboardingFactorCheck> {
  const { data, error } = await supabase.auth.mfa.listFactors();
  if (error) throw error;
  const totpFactors = data.all.filter((factor) => factor.factor_type === 'totp');
  const verified = totpFactors.filter((factor) => factor.status === 'verified');
  const [newestPending] = totpFactors
    .filter((factor) => factor.status === 'unverified')
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  const factor =
    verified.length === 0 ? newestPending : verified.length === 1 ? verified[0] : undefined;
  if (!factor) return 'no_factor';
  const result = await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code });
  return totpCheck(result.error);
}

// Only at AAL2, after the factor (code, then factor, then password: docs/Security.md §5.1). The password an earlier,
// interrupted onboarding of this account already set reads as set.
async function setOnboardingPassword(
  supabase: SessionClient,
  password: string,
): Promise<OnboardingPassword> {
  const { error } = await supabase.auth.updateUser({ password });
  if (!error || error.code === SAME_PASSWORD) return 'set';
  if (!isRefusal(error)) throw error;
  return 'weak';
}

export interface OnboardingCompletion {
  verifyFactor: (code: string) => Promise<OnboardingFactorCheck>;
  // The session as the token lifted by verifyFactor says, read through the same client.
  readSession: () => Promise<OnboardingGuardResult>;
  setPassword: (password: string) => Promise<OnboardingPassword>;
  // accept_staff_invite ended every session of the account in the database; this clears this browser's cookies,
  // which auth-js does whatever Supabase Auth answers about a session that no longer exists.
  end: () => Promise<void>;
}

// One session client for every step, so each reads the token the step before it wrote.
export async function startOnboardingCompletion(): Promise<OnboardingCompletion> {
  const supabase = await createSupabaseServerClient();
  return {
    verifyFactor: (code) => verifyOnboardingFactor(supabase, code),
    readSession: () => readOnboardingContext(supabase),
    setPassword: (password) => setOnboardingPassword(supabase, password),
    end: async () => {
      await supabase.auth.signOut({ scope: 'local' });
    },
  };
}

// What /onboarding shows (onboarding_state(), 20261103131200): booleans about the signed-in account only.
export async function readOnboardingStateOfSession(): Promise<OnboardingState> {
  return readOnboardingState(await createSupabaseServerClient());
}
