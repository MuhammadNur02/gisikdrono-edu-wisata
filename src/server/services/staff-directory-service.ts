import 'server-only';

import { STAFF_LIST_MAX_ROWS } from '@/config/staff';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { pageRange, parseSort } from '@/lib/utils/list-query';
import type { StaffContext } from '@/server/auth/guards';
import { readStaffAuthStates } from '@/server/services/staff-service';
import type { ListResult } from '@/types/data-table';
import type { StaffInviteSummary, StaffMember } from '@/types/staff';

// What /dashboard/users reads (Task P4.8.03). Profiles and invites come through the superadmin's session client, so
// profiles_staff_read, staff_invites_super_read and the AAL2 policy decide; the Auth state of the listed ids comes
// from staff-service.ts. Neither the invite code's hash nor any phone number is selected.

export const STAFF_STATUS_FILTERS = ['active', 'inactive'] as const;
const SORTABLE = ['name'] as const;

export interface StaffListQuery {
  q: string;
  sort: string;
  page: number;
  per: number;
  status: readonly string[];
  rw: number | null;
}

type ProfileRow = {
  id: string;
  email: string;
  full_name: string;
  role: StaffMember['role'];
  rw_id: number | null;
  is_active: boolean;
  promotion_requested_at: string | null;
  mfa_reset_requested_at: string | null;
  became_staff_at: string | null;
};

// One status narrows the list; both, or none, keep every account.
function activeFilterOf(status: readonly string[]): boolean | null {
  const wanted = STAFF_STATUS_FILTERS.filter((value) => status.includes(value));
  if (wanted.length !== 1) return null;
  return wanted[0] === 'active';
}

async function readProfiles(query: StaffListQuery): Promise<ProfileRow[]> {
  const supabase = await createSupabaseServerClient();
  let request = supabase
    .from('profiles')
    .select(
      'id, email, full_name, role, rw_id, is_active, promotion_requested_at, mfa_reset_requested_at, became_staff_at',
    )
    .order('full_name')
    .limit(STAFF_LIST_MAX_ROWS);
  const isActive = activeFilterOf(query.status);
  if (isActive !== null) request = request.eq('is_active', isActive);
  if (query.rw !== null) request = request.eq('rw_id', query.rw);
  const { data, error } = await request;
  if (error) throw error;
  return data;
}

// The kelurahan has a handful of staff, so the search and the order run here rather than through .or() filters
// (CLAUDE.md §6.3 bans them with typed input).
function matchingRows(rows: ProfileRow[], query: StaffListQuery): ProfileRow[] {
  const needle = query.q.trim().toLowerCase();
  const found =
    needle === ''
      ? rows
      : rows.filter((row) => `${row.full_name} ${row.email}`.toLowerCase().includes(needle));
  const order = parseSort(query.sort, SORTABLE);
  return order?.ascending === false ? [...found].reverse() : found;
}

// M1 of the security review of PR #77: an account the invite email made that never became staff (no role and no
// profiles.became_staff_at, which only finishing onboarding sets; internal.is_never_staff) is still being onboarded.
// Only accept_staff_invite gives it access, so the list offers it no role and no reactivation, only its invite's
// revoke (set_staff_status and set_staff_role refuse it too, 20261103131300).
function isAwaitingOnboarding(row: ProfileRow): boolean {
  return row.role === 'none' && row.became_staff_at === null;
}

export async function listStaffMembers(
  ctx: StaffContext,
  query: StaffListQuery,
  openInvites: readonly StaffInviteSummary[],
): Promise<ListResult<StaffMember>> {
  const rows = matchingRows(await readProfiles(query), query);
  const inviteOf = new Map(openInvites.map((invite) => [invite.email.toLowerCase(), invite]));
  const { from, to } = pageRange(query.page, query.per);
  const page = rows.slice(from, to + 1);
  const authStates = await readStaffAuthStates(page.map((row) => row.id));
  const members = page.map((row): StaffMember => {
    const auth = authStates.get(row.id);
    return {
      id: row.id,
      fullName: row.full_name,
      email: row.email,
      role: row.role,
      rwId: row.rw_id,
      isActive: row.is_active,
      hasVerifiedTotp: auth?.hasVerifiedTotp ?? false,
      isBanned: auth?.isBanned ?? false,
      lastSignInAt: auth?.lastSignInAt ?? null,
      promotionRequestedAt: row.promotion_requested_at,
      mfaResetRequestedAt: row.mfa_reset_requested_at,
      isSelf: row.id === ctx.userId,
      isAwaitingOnboarding: isAwaitingOnboarding(row),
      pendingInvite: isAwaitingOnboarding(row)
        ? (inviteOf.get(row.email.toLowerCase()) ?? null)
        : null,
    };
  });
  return { rows: members, total: rows.length };
}

// Invites still open: not accepted, not revoked, not yet expired.
export async function listOpenInvites(): Promise<StaffInviteSummary[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('staff_invites')
    .select('id, email, role, rw_id, expires_at, created_at')
    .is('accepted_at', null)
    .is('revoked_at', null)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data.map((row) => ({
    id: row.id,
    email: row.email,
    role: row.role,
    rwId: row.rw_id,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
  }));
}
