import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@/db/types';
import type { StaffContext } from '@/server/auth/guards';

// Who may upload, read from the database with the service-role client upload-service.ts hands in (it creates that
// client; this module never does). The service role skips RLS, so both answers come from the rows themselves.

type DatabaseClient = SupabaseClient<Database>;

// The profile as it is now (security review of PR #14, L9): RLS, which would hold a deactivated officer or one
// moved to another RW to the profile, does not apply to the service role, so the profile is read here.
export async function currentStaff(adminClient: DatabaseClient, ctx: StaffContext) {
  const { data, error } = await adminClient
    .from('profiles')
    .select('role, rw_id, is_active, claims_version')
    .eq('id', ctx.userId)
    .maybeSingle();
  if (error) throw error;
  if (!data?.is_active || data.claims_version !== ctx.claimsVersion) return null;
  return { ...ctx, role: data.role, rwId: data.rw_id };
}

// The RWs are rows of rw_units, so an RW number is only an upload owner if its row exists; otherwise public-media
// would collect files under a folder nobody owns (independent review of Task P2.10.02, L2).
export async function isUploadOwner(
  adminClient: DatabaseClient,
  rwId: number | null,
): Promise<boolean> {
  if (rwId === null) return true;
  const { data, error } = await adminClient
    .from('rw_units')
    .select('id')
    .eq('id', rwId)
    .maybeSingle();
  if (error) throw error;
  return data !== null;
}
