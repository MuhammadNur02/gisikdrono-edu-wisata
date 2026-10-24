import 'server-only';

import { cache } from 'react';

import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { UpdateProfileValues } from '@/lib/validations/dashboard';
import type { StaffProfile } from '@/types/staff';

// A staff member's own profile through the session client, so profiles_staff_read, profiles_update_own and the AAL2
// policy decide (0005). Each query names the signed-in member's own id; the superadmin's wider policy is never used
// here to touch someone else's row.

const PROFILE_COLUMNS = 'full_name, email, phone';

type ProfileRow = { full_name: string; email: string; phone: string | null };

function profileOf(row: ProfileRow): StaffProfile {
  return { fullName: row.full_name, email: row.email, phone: row.phone };
}

// cache(): the dashboard layout and /dashboard/profile read it in the same request.
export const readOwnProfile = cache(async (userId: string): Promise<StaffProfile> => {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('profiles')
    .select(PROFILE_COLUMNS)
    .eq('id', userId)
    .single();
  if (error) throw error;
  return profileOf(data);
});

// Only full_name and phone are written (Task P4.8.03): role, RW and status move through the staff RPCs
// (profiles_guard, 0004). A phone the form left out stays as it is.
export async function updateOwnProfile(
  userId: string,
  values: UpdateProfileValues,
): Promise<StaffProfile> {
  const supabase = await createSupabaseServerClient();
  const changes =
    values.phone === undefined
      ? { full_name: values.fullName }
      : { full_name: values.fullName, phone: values.phone };
  const { data, error } = await supabase
    .from('profiles')
    .update(changes)
    .eq('id', userId)
    .select(PROFILE_COLUMNS)
    .single();
  if (error) throw error;
  return profileOf(data);
}
