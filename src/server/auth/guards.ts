import 'server-only';

import { z } from 'zod';

import { DB_ENUMS } from '@/db/enums';
import type { AppRole } from '@/db/enums';
import { fail } from '@/lib/errors';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { ActionFailure } from '@/types/action-result';

const MS_PER_SECOND = 1000;

export type StaffContext = {
  userId: string;
  role: AppRole;
  rwId: number | null;
  isAal2: boolean;
  // Unix seconds of the last TOTP check in this session, or null when there was none.
  totpVerifiedAt: number | null;
  // profiles.claims_version when the token was minted; server code acting with the service role compares it with
  // the profile, because RLS, which would, does not apply to it (docs/Security.md AZ-09).
  claimsVersion: number | null;
};

export type GuardResult = { ok: true; ctx: StaffContext } | ActionFailure;

// app_role, app_rw_id and claims_version come from public.custom_access_token_hook (CLAUDE.md §6.2).
const staffClaimsSchema = z.object({
  sub: z.string(),
  app_role: z.enum(DB_ENUMS.app_role).default('none'),
  app_rw_id: z.number().int().nullable().default(null),
  claims_version: z.number().int().nullable().default(null),
  aal: z.enum(['aal1', 'aal2']),
  amr: z.array(z.object({ method: z.string(), timestamp: z.number() })).default([]),
});

// getUser() asks Supabase Auth whether the session is still alive; getClaims() then reads the
// verified JWT for the role claims, which the user object does not carry.
async function readStaffContext(): Promise<StaffContext | null> {
  const supabase = await createSupabaseServerClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return null;

  const { data: claimsData } = await supabase.auth.getClaims();
  const claims = staffClaimsSchema.safeParse(claimsData?.claims);
  if (!claims.success || claims.data.sub !== userData.user.id) return null;

  const totpTimes = claims.data.amr.filter((entry) => entry.method === 'totp');
  return {
    userId: userData.user.id,
    role: claims.data.app_role,
    rwId: claims.data.app_rw_id,
    isAal2: claims.data.aal === 'aal2',
    totpVerifiedAt: totpTimes.length > 0 ? Math.max(...totpTimes.map((e) => e.timestamp)) : null,
    claimsVersion: claims.data.claims_version,
  };
}

function canAccessRw(ctx: StaffContext, rwId: number): boolean {
  return ctx.role === 'superadmin' || (ctx.role === 'admin_rw' && ctx.rwId === rwId);
}

function hasFreshTotp(ctx: StaffContext, maxAgeSeconds: number, nowSeconds: number) {
  return ctx.totpVerifiedAt !== null && nowSeconds - ctx.totpVerifiedAt <= maxAgeSeconds;
}

// A deactivated account keeps a valid JWT until it expires, but its role claim is already 'none'.
export async function requireUser(): Promise<GuardResult> {
  const ctx = await readStaffContext();
  if (!ctx) return fail('UNAUTHENTICATED');
  if (ctx.role === 'none') return fail('FORBIDDEN');
  return { ok: true, ctx };
}

export async function requireRole(role: Exclude<AppRole, 'none'>): Promise<GuardResult> {
  const guard = await requireUser();
  if (!guard.ok) return guard;
  return guard.ctx.role === role ? guard : fail('FORBIDDEN');
}

export async function requireRwAccess(rwId: number): Promise<GuardResult> {
  const guard = await requireUser();
  if (!guard.ok) return guard;
  return canAccessRw(guard.ctx, rwId) ? guard : fail('FORBIDDEN');
}

// api/uploads/{sign,finalize} write with the service role, which skips the AAL2 policy every table carries,
// so uploads ask for AAL2 here (docs/Security.md §5.3, §8.4). Kelurahan-level files (rw_id NULL) are the
// superadmin's; an RW's files are its own officer's too. The routes call this after requireUser() so a
// refusal can be recorded against the staff member who tried.
export function hasUploadAccess(ctx: StaffContext, rwId: number | null): boolean {
  if (!ctx.isAal2) return false;
  return rwId === null ? ctx.role === 'superadmin' : canAccessRw(ctx, rwId);
}

export async function requireAal2(): Promise<GuardResult> {
  const guard = await requireUser();
  if (!guard.ok) return guard;
  return guard.ctx.isAal2 ? guard : fail('FORBIDDEN');
}

// docs/Security.md §5.3: critical actions need a TOTP check from the last few minutes.
export async function requireFreshTotp(maxAgeSeconds: number): Promise<GuardResult> {
  const guard = await requireAal2();
  if (!guard.ok) return guard;
  const nowSeconds = Math.floor(Date.now() / MS_PER_SECOND);
  return hasFreshTotp(guard.ctx, maxAgeSeconds, nowSeconds) ? guard : fail('FORBIDDEN');
}
