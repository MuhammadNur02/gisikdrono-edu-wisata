import 'server-only';

import { withinRateLimits } from '@/lib/rate-limit';
// The service role is needed for two things nobody can do before signing in: the limiter is an internal function no
// API role may call (P1.3.24), and whether an account finished onboarding is written only in its profile, which RLS
// shows to its own staff member at AAL2. Every query is keyed by the visitor's own IP or by the address they typed,
// and nothing read here goes back to the browser: the pages answer the same whatever it says (docs/Security.md
// §5.1, AUTH-06).
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { normalizeEmail } from '@/lib/validations/normalize';

// docs/Security.md §8.3: per IP, and per IP and address together. The Auth hook keeps its own count of failures per
// account inside Supabase Auth on top of these (§5.5).
export function withinSignInLimits(clientIp: string, email: string): Promise<boolean> {
  return withinRateLimits(createSupabaseAdminClient(), [
    { name: 'login:ip', subject: clientIp },
    { name: 'login:ip+email', subject: `${clientIp}|${normalizeEmail(email)}` },
  ]);
}

export function withinPasswordResetLimits(clientIp: string, email: string): Promise<boolean> {
  return withinRateLimits(createSupabaseAdminClient(), [
    { name: 'password_reset:ip', subject: clientIp },
    { name: 'password_reset:email', subject: normalizeEmail(email) },
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
