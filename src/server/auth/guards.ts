import 'server-only';

import { cookies, headers } from 'next/headers';
import { z } from 'zod';

import type { GuestLinkScope } from '@/config/guest';
import { EDU_WISATA_ROLES, UMKM_MANAGER_ROLES } from '@/config/staff';
import { DB_ENUMS } from '@/db/enums';
import type { AppRole } from '@/db/enums';
import { fail } from '@/lib/errors';
import { guestLinkCookieName } from '@/lib/links/token';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { UploadPurpose } from '@/lib/uploads/paths';
import { clientIpFrom } from '@/lib/utils/client-ip';
import { isBookingCode } from '@/lib/utils/codes';
import { nowInSeconds } from '@/server/auth/guest-cookies';
import {
  readOnboardingContext,
  type OnboardingGuardResult,
} from '@/server/auth/onboarding-context';
import { verifyGuestAccess, type GuestAccess } from '@/server/services/booking-service';
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

export type { OnboardingContext, OnboardingGuardResult } from '@/server/auth/onboarding-context';

export type StaffRole = Exclude<AppRole, 'none'>;

// What the sign-in pages and the dashboard gate need beyond the staff context: whether a TOTP factor is verified
// (verify next, or enrol first), and how the session was opened (a recovery link leads to /reset-password).
export type StaffSession = {
  ctx: StaffContext;
  hasVerifiedTotp: boolean;
  authMethods: string[];
};

// app_role, app_rw_id and claims_version come from public.custom_access_token_hook (CLAUDE.md §6.2).
const staffClaimsSchema = z.object({
  sub: z.string(),
  app_role: z.enum(DB_ENUMS.app_role).default('none'),
  app_rw_id: z.number().int().nullable().default(null),
  claims_version: z.number().int().nullable().default(null),
  aal: z.enum(['aal1', 'aal2']),
  amr: z.array(z.object({ method: z.string(), timestamp: z.number() })).default([]),
});

type StaffClaims = z.infer<typeof staffClaimsSchema>;

function contextFrom(userId: string, claims: StaffClaims): StaffContext {
  const totpTimes = claims.amr.filter((entry) => entry.method === 'totp');
  return {
    userId,
    role: claims.app_role,
    rwId: claims.app_rw_id,
    isAal2: claims.aal === 'aal2',
    totpVerifiedAt: totpTimes.length > 0 ? Math.max(...totpTimes.map((e) => e.timestamp)) : null,
    claimsVersion: claims.claims_version,
  };
}

// getUser() asks Supabase Auth whether the session is still alive and lists its factors; getClaims() then reads
// the verified JWT for the role claims, which the user object does not carry. getSession() is never used for this:
// it trusts whatever the cookie says (CLAUDE.md §6.2).
export async function readStaffSession(): Promise<StaffSession | null> {
  const supabase = await createSupabaseServerClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return null;

  const { data: claimsData } = await supabase.auth.getClaims();
  const claims = staffClaimsSchema.safeParse(claimsData?.claims);
  if (!claims.success || claims.data.sub !== userData.user.id) return null;

  const factors = userData.user.factors ?? [];
  return {
    ctx: contextFrom(userData.user.id, claims.data),
    hasVerifiedTotp: factors.some(
      (factor) => factor.factor_type === 'totp' && factor.status === 'verified',
    ),
    authMethods: claims.data.amr.map((entry) => entry.method),
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
  const session = await readStaffSession();
  if (!session) return fail('UNAUTHENTICATED');
  if (session.ctx.role === 'none') return fail('FORBIDDEN');
  return { ok: true, ctx: session.ctx };
}

// The account /onboarding serves (Task P4.8.01): see src/server/auth/onboarding-context.ts.
export async function requireOnboardingUser(): Promise<OnboardingGuardResult> {
  return readOnboardingContext(await createSupabaseServerClient());
}

// requireRole('superadmin') for the kelurahan's own work; the dashboard shell lets every staff role in.
export async function requireRole(...roles: [StaffRole, ...StaffRole[]]): Promise<GuardResult> {
  const guard = await requireUser();
  if (!guard.ok) return guard;
  return roles.some((role) => role === guard.ctx.role) ? guard : fail('FORBIDDEN');
}

export async function requireRwAccess(rwId: number): Promise<GuardResult> {
  const guard = await requireUser();
  if (!guard.ok) return guard;
  return canAccessRw(guard.ctx, rwId) ? guard : fail('FORBIDDEN');
}

// What the Kopdes admin publishes: product photos, of any RW, and nothing else (docs/PRD.md §13.1 A30).
const KOPDES_UPLOAD_PURPOSES: readonly UploadPurpose[] = ['product'];

// api/uploads/{sign,finalize} write with the service role, which skips the AAL2 policy every table carries,
// so uploads ask for AAL2 here (docs/Security.md §5.3, §8.4). Kelurahan-level files (rw_id NULL) are the
// superadmin's; an RW's files are its own officer's too. The Kopdes admin uploads into an RW's folder for a product
// only. The purpose is null at the sign step, which knows none yet: a signed URL only reaches the quarantine, and
// finalize, which publishes, names one. The routes call this after requireUser() so a refusal can be recorded
// against the staff member who tried.
export function hasUploadAccess(
  ctx: StaffContext,
  rwId: number | null,
  purpose: UploadPurpose | null,
): boolean {
  if (!ctx.isAal2) return false;
  if (ctx.role === 'admin_kopdes') {
    return rwId !== null && (purpose === null || KOPDES_UPLOAD_PURPOSES.includes(purpose));
  }
  return rwId === null ? ctx.role === 'superadmin' : canAccessRw(ctx, rwId);
}

// AAL2 and one of the roles named. Without any it means the edu-wisata staff (EDU_WISATA_ROLES), so an action that names no
// roles keeps the Kopdes admin out (docs/PRD.md §13.1 A30); the database refuses it there again.
export async function requireAal2(
  roles: readonly StaffRole[] = EDU_WISATA_ROLES,
): Promise<GuardResult> {
  const guard = await requireUser();
  if (!guard.ok) return guard;
  if (!roles.some((role) => role === guard.ctx.role)) return fail('FORBIDDEN');
  return guard.ctx.isAal2 ? guard : fail('FORBIDDEN');
}

// The UMKM catalogue's writes (vendors, products, variants, sellers' bank accounts): the superadmin or the Kopdes
// admin, at AAL2, as manages_umkm() in the database.
export async function requireUmkmManager(): Promise<GuardResult> {
  return requireAal2(UMKM_MANAGER_ROLES);
}

// docs/Security.md §5.3: critical actions need a TOTP check from the last few minutes.
export async function requireFreshTotp(
  maxAgeSeconds: number,
  roles: readonly StaffRole[] = EDU_WISATA_ROLES,
): Promise<GuardResult> {
  const guard = await requireAal2(roles);
  if (!guard.ok) return guard;
  const nowSeconds = Math.floor(Date.now() / MS_PER_SECOND);
  return hasFreshTotp(guard.ctx, maxAgeSeconds, nowSeconds) ? guard : fail('FORBIDDEN');
}

export type GuestGuardResult = { ok: true; guest: GuestAccess } | ActionFailure;

// docs/Security.md §6.7, GUEST-02, APP-15: a guest page or action opens only with the bk_<code> cookie that
// src/middleware.ts made from a ?t= link. A missing, forged, expired or revoked link, one for another booking or too
// narrow for the page, too many checks from one IP, and an outage all answer the same NOT_FOUND, so the answer tells
// a guesser nothing; pages turn it into notFound().
export async function requireGuestToken(
  bookingCode: string,
  required: GuestLinkScope,
): Promise<GuestGuardResult> {
  const notFound = fail('NOT_FOUND');
  if (!isBookingCode(bookingCode)) return notFound;
  const token = (await cookies()).get(guestLinkCookieName(bookingCode, required))?.value;
  if (token === undefined) return notFound;
  try {
    const guest = await verifyGuestAccess({
      bookingCode,
      token,
      required,
      clientIp: clientIpFrom(await headers()),
      nowSeconds: nowInSeconds(),
    });
    return guest ? { ok: true, guest } : notFound;
  } catch {
    return notFound;
  }
}
