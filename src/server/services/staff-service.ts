import 'server-only';

import { createLogger } from '@/lib/logger';
import { withinRateLimits } from '@/lib/rate-limit';
// The service role is needed for three things nobody can do before signing in: the limiter is an internal function
// no API role may call (P1.3.24); whether an account finished onboarding is written only in its profile, which RLS
// shows to its own staff member at AAL2; and a recovery email sent with it keeps no session and no PKCE verifier, so
// nothing reaches the visitor's cookies. Every query is keyed by the visitor's own IP or by the address they typed,
// and nothing read here goes back to the browser: the pages answer the same whatever it says (docs/Security.md
// §5.1, AUTH-06).
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { rateLimitIpBucket } from '@/lib/utils/client-ip';
import { normalizeEmail } from '@/lib/validations/normalize';

// docs/Security.md §8.3: per IP, and per IP and address together. The Auth hook keeps its own count of failures per
// account inside Supabase Auth on top of these (§5.5).
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
