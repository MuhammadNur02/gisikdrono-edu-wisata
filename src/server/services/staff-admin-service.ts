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
import { setStaffAuthBan } from '@/server/services/staff-service';
import type { IssuedInvite, StaffRoleChange, StaffStatusChange } from '@/types/staff';

// The superadmin's changes on /dashboard/users (Task P4.8.02). Every write goes through the superadmin's session
// client: the staff RPCs of 0004 and 0005 check the fresh TOTP, refuse the caller's own row and keep the last active
// superadmin, and the restrictive fresh_totp() policies guard staff_invites. The only service-role step is the Auth
// ban in staff-service.ts.

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

async function insertRwAdminInvite(ctx: StaffContext, input: InviteStaffValues, hash: string) {
  const supabase = await createSupabaseServerClient();
  const expiresAt = new Date(Date.now() + INVITE_EXPIRY_SECONDS * MS_PER_SECOND).toISOString();
  // Only the id comes back: the hash is written once and read by no API role (0005).
  const { error } = await supabase
    .from('staff_invites')
    .insert({
      email: input.email,
      role: 'admin_rw',
      rw_id: input.rwId,
      invite_code_hash: hash,
      expires_at: expiresAt,
      created_by: ctx.userId,
    })
    .select('id')
    .single();
  if (error) throw error;
  return expiresAt;
}

// docs/Security.md §5.1: the code exists in plain only in this answer, for the superadmin to read out once.
export async function createStaffInvite(
  ctx: StaffContext,
  input: InviteStaffValues,
): Promise<IssuedInvite> {
  await assertNoStaffAccount(input.email);
  const inviteCode = drawInviteCode();
  const hash = inviteCodeHash(inviteCode);
  return asStaffChange(async () => {
    if (input.role === 'superadmin') {
      const supabase = await createSupabaseServerClient();
      const invite = await inviteSuperadmin(supabase, { email: input.email, inviteCodeHash: hash });
      return { inviteCode, expiresAt: invite.lapsesAfter, acceptableAfter: invite.completesAfter };
    }
    const expiresAt = await insertRwAdminInvite(ctx, input, hash);
    return { inviteCode, expiresAt, acceptableAfter: null };
  });
}

// Revoking is final (staff_invites_guard); an invite already accepted or revoked is left as it is.
export async function revokeStaffInvite(inviteId: string): Promise<void> {
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
}

function roleChangeOf(stage: StaffChangeStage): StaffRoleChange {
  return stage.stage === 'requested'
    ? { stage: 'requested', completesAfter: stage.completesAfter }
    : { stage: 'applied' };
}

export async function changeStaffRole(input: SetStaffRoleValues): Promise<StaffRoleChange> {
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
