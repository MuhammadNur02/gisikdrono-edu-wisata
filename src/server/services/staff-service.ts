import 'server-only';

import type { User } from '@supabase/supabase-js';

import { AUTH_USERS_PAGE_SIZE, STAFF_BAN_DURATION, STAFF_UNBAN_DURATION } from '@/config/staff';
import { createLogger } from '@/lib/logger';
import { withinRateLimits } from '@/lib/rate-limit';
// The service role is needed for four things the session cannot do: the limiter is an internal function no API role
// may call (P1.3.24); whether an account finished onboarding is written only in its profile, which RLS shows to its
// own staff member at AAL2; a recovery email sent with it keeps no session and no PKCE verifier, so nothing reaches
// the visitor's cookies; and no API role may write security_events. Every query is keyed by the visitor's own IP, by
// the address they typed or by the id of the verified session, and nothing read here goes back to the browser: the
// pages answer the same whatever it says (docs/Security.md §5.1, AUTH-06). Keying by a typed address rather than a
// verified id is the exception CLAUDE.md §6.1 records for this module (I2 of the independent review of PR #17).
// /dashboard/users (Task P4.8.03) adds two more, both for the superadmin at AAL2 only: whether each account has a
// verified TOTP factor, its last sign-in and its ban live in auth.users, which no API role reads, and are returned as
// booleans and times keyed by the profile ids the superadmin already read under RLS; and the ban of
// docs/Security.md §5.6 step 2 is the Auth admin API's, called only after set_staff_status has accepted the
// superadmin's fresh TOTP and the change for that same id.
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { rateLimitIpBucket } from '@/lib/utils/client-ip';
import { normalizeEmail } from '@/lib/validations/normalize';
import type { StaffContext } from '@/server/auth/guards';

// docs/Security.md §8.3: per IP, and per IP and address together. Where the password hook runs (the local stack;
// the hosted Pro projects have none) it also counts failures per account inside Supabase Auth (§5.5).
export function withinSignInLimits(clientIp: string, email: string): Promise<boolean> {
  const ip = rateLimitIpBucket(clientIp);
  return withinRateLimits(createSupabaseAdminClient(), [
    { name: 'login:ip', subject: ip },
    { name: 'login:ip+email', subject: `${ip}|${normalizeEmail(email)}` },
  ]);
}

// The limits /forgot-password checks before it answers. Both count only the visitor's own requests, so the answer
// says nothing about the address.
export function withinPasswordResetLimits(clientIp: string, email: string): Promise<boolean> {
  const ip = rateLimitIpBucket(clientIp);
  return withinRateLimits(createSupabaseAdminClient(), [
    { name: 'password_reset:ip', subject: ip },
    { name: 'password_reset:ip+email', subject: `${ip}|${normalizeEmail(email)}` },
  ]);
}

export function withinAuthCallbackLimit(clientIp: string): Promise<boolean> {
  return withinRateLimits(createSupabaseAdminClient(), [
    { name: 'auth_callback:ip', subject: rateLimitIpBucket(clientIp) },
  ]);
}

// The codes a signed-in staff member types to unlock the idle screen or step up (Task P4.1.01, AUTH-11), counted
// per verified session id, never per anything typed.
export function withinStepUpLimit(userId: string): Promise<boolean> {
  return withinRateLimits(createSupabaseAdminClient(), [{ name: 'step_up:user', subject: userId }]);
}

// L2 of the PR #43 review: invites per superadmin, counted by the verified session id before anything is written.
export function withinInviteLimit(userId: string): Promise<boolean> {
  return withinRateLimits(createSupabaseAdminClient(), [{ name: 'invite:user', subject: userId }]);
}

// docs/Security.md §5.1 (AUTH-09): a reset link only for an active account that finished onboarding, which is when
// set_staff_role gave it a role. An invited mailbox alone never gets a password this way.
export async function canResetPassword(email: string): Promise<boolean> {
  const { data, error } = await createSupabaseAdminClient()
    .from('profiles')
    .select('role, is_active')
    .eq('email', email)
    .maybeSingle();
  if (error) throw error;
  return data !== null && data.is_active && data.role !== 'none';
}

// Runs in after(), once /forgot-password has answered, so whether an address gets an email changes neither the answer
// nor how long it takes (F1 of the PR #17 review). The service-role client sends the email without a PKCE verifier:
// the link carries a token_hash that auth/callback verifies, in whichever browser opens it. Supabase Auth skips its
// own captcha check for the service role, which is why the action checks the Turnstile token first. Nobody waits for
// the outcome, so every failure ends in the log.
export async function sendPasswordResetEmail(email: string, requestId: string): Promise<void> {
  const log = createLogger(requestId);
  try {
    const adminClient = createSupabaseAdminClient();
    const dailyCeiling = { name: 'password_reset:email', subject: normalizeEmail(email) } as const;
    if (!(await withinRateLimits(adminClient, [dailyCeiling]))) return;
    if (!(await canResetPassword(email))) return;
    const { error } = await adminClient.auth.resetPasswordForEmail(email);
    if (error)
      log.warn('internal_error', { source: 'password_reset', authErrorCode: error.code ?? null });
  } catch (error) {
    // Only the type, as mapError does: a message can quote the address.
    log.error('internal_error', {
      source: 'password_reset',
      errorName: error instanceof Error ? error.name : typeof error,
    });
  }
}

export type SessionRevokeFlow = 'password_change' | 'sign_out';

// S1 of the PR #17 review: Supabase Auth could not end the account's other sessions, so another device may still be
// signed in. The staff member is told either way, so a failed write ends in the log rather than in an error page.
export async function recordSessionRevokeFailure(
  ctx: StaffContext,
  flow: SessionRevokeFlow,
  requestId: string,
): Promise<void> {
  const log = createLogger(requestId);
  log.warn('session_revoke_failed', { userId: ctx.userId, flow });
  const { error } = await createSupabaseAdminClient().from('security_events').insert({
    event_type: 'session_revoke_failed',
    severity: 'high',
    actor_id: ctx.userId,
    actor_role: ctx.role,
    rw_id: ctx.rwId,
    entity_type: 'auth_session',
    details: { flow },
  });
  if (error)
    log.error('internal_error', { source: 'session_revoke_failed', errorName: error.name });
}

// What /dashboard/users shows from Supabase Auth for one account (Task P4.8.03).
export interface StaffAuthState {
  hasVerifiedTotp: boolean;
  isBanned: boolean;
  lastSignInAt: string | null;
}

function authStateOf(user: User, nowMs: number): StaffAuthState {
  const factors = user.factors ?? [];
  const bannedUntil = user.banned_until ? Date.parse(user.banned_until) : Number.NaN;
  return {
    hasVerifiedTotp: factors.some((f) => f.factor_type === 'totp' && f.status === 'verified'),
    isBanned: bannedUntil > nowMs,
    lastSignInAt: user.last_sign_in_at ?? null,
  };
}

// One page of Auth users covers the kelurahan's staff many times over; only the ids asked for are kept.
export async function readStaffAuthStates(
  userIds: readonly string[],
): Promise<Map<string, StaffAuthState>> {
  const states = new Map<string, StaffAuthState>();
  if (userIds.length === 0) return states;
  const { data, error } = await createSupabaseAdminClient().auth.admin.listUsers({
    page: 1,
    perPage: AUTH_USERS_PAGE_SIZE,
  });
  if (error) throw error;
  const wanted = new Set(userIds);
  const nowMs = Date.now();
  for (const user of data.users) {
    if (wanted.has(user.id)) states.set(user.id, authStateOf(user, nowMs));
  }
  return states;
}

// docs/Security.md §5.6 step 2: a deactivated account is banned in Supabase Auth, a reactivated one unbanned. The
// profile has already changed; a failed call is reported, so the superadmin repeats the step, and logged by id only.
export async function setStaffAuthBan(
  userId: string,
  isBanned: boolean,
  requestId: string,
): Promise<boolean> {
  const { error } = await createSupabaseAdminClient().auth.admin.updateUserById(userId, {
    ban_duration: isBanned ? STAFF_BAN_DURATION : STAFF_UNBAN_DURATION,
  });
  if (!error) return true;
  createLogger(requestId).error('internal_error', {
    source: 'staff_ban',
    userId,
    authErrorCode: error.code ?? null,
  });
  return false;
}
