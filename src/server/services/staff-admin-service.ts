import 'server-only';

import { INVITE_EXPIRY_SECONDS } from '@/config/staff';
import {
  cancelSuperadminPromotion,
  setStaffRole,
  setStaffStatus,
  type StaffChangeStage,
} from '@/db/rpc';
import { inviteSuperadmin } from '@/db/rpc-staff';
import { staffCopy } from '@/lib/copy/staff';
import { AppError, raisedHintOf } from '@/lib/errors';
import { drawInviteCode, inviteCodeHash } from '@/lib/staff-codes';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type {
  InviteStaffValues,
  SetStaffRoleValues,
  SetStaffStatusValues,
} from '@/lib/validations/staff';
import type { StaffContext } from '@/server/auth/guards';
import {
  readStaffAuthStates,
  releaseRevokedInviteAccount,
  sendStaffInviteEmail,
  setStaffAuthBan,
} from '@/server/services/staff-service';
import type { IssuedInvite, StaffRoleChange, StaffStatusChange } from '@/types/staff';

// The superadmin's changes on /dashboard/users (Task P4.8.02). Every write goes through the superadmin's session
// client: the staff RPCs of 0004 and 0005 check the fresh TOTP, refuse the caller's own row and keep the last active
// superadmin, and the restrictive fresh_totp() policies guard staff_invites. The service-role steps live in
// staff-service.ts: the Auth ban, and the invite email and the release of a revoked invite's Auth user (Task P4.8.01).

const MS_PER_SECOND = 1000;
const UNIQUE_VIOLATION = '23505';
const INSUFFICIENT_PRIVILEGE = '42501';
const NO_DATA_FOUND = 'P0002';
const INVALID_PARAMETER = '22023';

function postgresCodeOf(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null || !('code' in error)) return undefined;
  return typeof error.code === 'string' ? error.code : undefined;
}

// What a staff RPC's refusal means to the superadmin; anything else is thrown on for mapError to log.
function staffRefusal(error: unknown): AppError | null {
  const code = postgresCodeOf(error);
  if (code === INSUFFICIENT_PRIVILEGE) return new AppError('FORBIDDEN', staffCopy.notFresh);
  if (code === NO_DATA_FOUND) return new AppError('NOT_FOUND', staffCopy.notFound);
  if (code === INVALID_PARAMETER) return new AppError('VALIDATION');
  if (code === UNIQUE_VIOLATION) return new AppError('CONFLICT', staffCopy.invite.exists);
  if (raisedHintOf(error) === 'STATE_INVALID')
    return new AppError('STATE_INVALID', staffCopy.stateInvalid);
  return null;
}

async function asStaffChange<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    throw staffRefusal(error) ?? error;
  }
}

async function assertNoStaffAccount(email: string): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('profiles')
    .select('id')
    .eq('email', email)
    .maybeSingle();
  if (error) throw error;
  if (data) throw new AppError('CONFLICT', staffCopy.invite.exists);
}

// An RW admin's or the Kopdes admin's invite (docs/PRD.md §13.1 A30), a plain insert under RLS; a superadmin's goes
// through invite_superadmin instead.
async function insertStaffInvite(
  ctx: StaffContext,
  role: 'admin_rw' | 'admin_kopdes',
  input: InviteStaffValues,
  hash: string,
) {
  const supabase = await createSupabaseServerClient();
  const expiresAt = new Date(Date.now() + INVITE_EXPIRY_SECONDS * MS_PER_SECOND).toISOString();
  // Only the id comes back: the hash is written once and read by no API role (0005).
  const { data, error } = await supabase
    .from('staff_invites')
    .insert({
      email: input.email,
      role,
      rw_id: role === 'admin_rw' ? input.rwId : null,
      invite_code_hash: hash,
      expires_at: expiresAt,
      created_by: ctx.userId,
    })
    .select('id')
    .single();
  if (error) throw error;
  return { inviteId: data.id, expiresAt };
}

type StoredInvite = Omit<IssuedInvite, 'inviteCode' | 'isEmailSent'> & { inviteId: string };

async function storeInvite(
  ctx: StaffContext,
  input: InviteStaffValues,
  hash: string,
): Promise<StoredInvite> {
  if (input.role === 'superadmin') {
    const supabase = await createSupabaseServerClient();
    const invite = await inviteSuperadmin(supabase, { email: input.email, inviteCodeHash: hash });
    return {
      inviteId: invite.inviteId,
      expiresAt: invite.lapsesAfter,
      acceptableAfter: invite.completesAfter,
    };
  }
  const invite = await insertStaffInvite(ctx, input.role, input, hash);
  return { ...invite, acceptableAfter: null };
}

// docs/Security.md §5.1: the code exists in plain only in this answer, for the superadmin to read out once. The
// invite email goes out as soon as the invite exists (Task P4.8.01); its link alone opens nothing but /onboarding.
export async function createStaffInvite(
  ctx: StaffContext,
  input: InviteStaffValues,
  requestId: string,
): Promise<IssuedInvite> {
  await assertNoStaffAccount(input.email);
  const inviteCode = drawInviteCode();
  const stored = await asStaffChange(() => storeInvite(ctx, input, inviteCodeHash(inviteCode)));
  const isEmailSent = await sendStaffInviteEmail(input.email, stored.inviteId, requestId);
  return {
    inviteCode,
    expiresAt: stored.expiresAt,
    acceptableAfter: stored.acceptableAfter,
    isEmailSent,
  };
}

// Revoking is final (staff_invites_guard); an invite already accepted or revoked is left as it is. The Auth user the
// invite email made goes with it (finding 4 of the onboarding review), or with the nightly purge if Auth failed now.
export async function revokeStaffInvite(inviteId: string, requestId: string): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('staff_invites')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', inviteId)
    .is('revoked_at', null)
    .is('accepted_at', null)
    .select('id');
  if (error) throw staffRefusal(error) ?? error;
  if (data.length === 0) throw new AppError('NOT_FOUND', staffCopy.notFound);
  await releaseRevokedInviteAccount(inviteId, requestId);
}

function roleChangeOf(stage: StaffChangeStage): StaffRoleChange {
  return stage.stage === 'requested'
    ? { stage: 'requested', completesAfter: stage.completesAfter }
    : { stage: 'applied' };
}

// M1 of the PR #43 review: deactivation removes every factor, so a role given to an account without a verified TOTP
// factor would let whoever signs in first enrol their own authenticator, an MFA reset without the re-enrolment code
// of P4.8.05. Every role set_staff_role can give here is a staff role, so such an account gets none until it has a
// factor again; set_staff_role itself is to refuse the same (DB lane, Task P4.3.11).
export async function changeStaffRole(input: SetStaffRoleValues): Promise<StaffRoleChange> {
  const authStates = await readStaffAuthStates([input.userId]);
  if (authStates.get(input.userId)?.hasVerifiedTotp !== true) {
    throw new AppError('STATE_INVALID', staffCopy.role.noFactor);
  }
  const supabase = await createSupabaseServerClient();
  return roleChangeOf(await asStaffChange(() => setStaffRole(supabase, input)));
}

// docs/Security.md §5.6: the profile first (role, sessions and factors go with it), then the Auth ban.
export async function changeStaffStatus(
  input: SetStaffStatusValues,
  requestId: string,
): Promise<StaffStatusChange> {
  const supabase = await createSupabaseServerClient();
  await asStaffChange(() => setStaffStatus(supabase, input));
  return { isBanApplied: await setStaffAuthBan(input.userId, !input.isActive, requestId) };
}

export async function cancelStaffPromotion(userId: string): Promise<void> {
  const supabase = await createSupabaseServerClient();
  await asStaffChange(() => cancelSuperadminPromotion(supabase, userId));
}
