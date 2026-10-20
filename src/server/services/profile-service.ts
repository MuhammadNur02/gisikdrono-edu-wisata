import 'server-only';

import { cache } from 'react';

import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { StaffProfile } from '@/types/staff';

// A staff member's own profile through the session client, so profiles_staff_read, profiles_update_own and the AAL2
// policy decide (0005). Each query names the signed-in member's own id; the superadmin's wider policy is never used
// here to touch someone else's row.

// cache(): the dashboard layout and /dashboard/profile read it in the same request.
export const readOwnProfile = cache(async (userId: string): Promise<StaffProfile> => {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('profiles')
    .select('full_name, email')
    .eq('id', userId)
    .single();
  if (error) throw error;
  return { fullName: data.full_name, email: data.email };
});

// Only full_name is written: role, RW and status move through the staff RPCs (profiles_guard, 0004).
export async function updateOwnFullName(userId: string, fullName: string): Promise<StaffProfile> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('profiles')
    .update({ full_name: fullName })
    .eq('id', userId)
    .select('full_name, email')
    .single();
  if (error) throw error;
  return { fullName: data.full_name, email: data.email };
}
