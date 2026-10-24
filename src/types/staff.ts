import type { AppRole } from '@/db/enums';

// The signed-in staff member's own profile as the dashboard shows it (the session client reads it under RLS).
export interface StaffProfile {
  fullName: string;
  email: string;
  // E.164, or null when none is set.
  phone: string | null;
}

// One row of /dashboard/users (Task P4.8.03). The profile comes through RLS; whether a TOTP factor is verified, the
// last sign-in and the ban come from Supabase Auth through staff-service.ts, as booleans and times only.
export interface StaffMember {
  id: string;
  fullName: string;
  email: string;
  role: AppRole;
  rwId: number | null;
  isActive: boolean;
  hasVerifiedTotp: boolean;
  isBanned: boolean;
  // ISO strings.
  lastSignInAt: string | null;
  promotionRequestedAt: string | null;
  mfaResetRequestedAt: string | null;
  isSelf: boolean;
}

// An invite that can still be accepted: neither accepted nor revoked nor expired. Never its code or its hash.
export interface StaffInviteSummary {
  id: string;
  email: string;
  role: AppRole;
  rwId: number | null;
  expiresAt: string;
  createdAt: string;
}

// What inviteStaffAction hands back once, for the superadmin to read out (docs/Security.md §5.1). Nothing stores it.
export interface IssuedInvite {
  inviteCode: string;
  expiresAt: string;
  // Set for a superadmin invite, which can be accepted only 24 hours after it was made (invite_superadmin).
  acceptableAfter: string | null;
}

// What set_staff_role answers: applied at once, or, for a promotion to superadmin, requested and due later.
export type StaffRoleChange = { stage: 'applied' } | { stage: 'requested'; completesAfter: string };

// set_staff_status changed the profile; banning or unbanning the Auth user is a second call that may fail on its own.
export interface StaffStatusChange {
  isBanApplied: boolean;
}
