import { createClient } from '@supabase/supabase-js';

import type { Database } from '@/db/types';
import { publicEnv } from '@/lib/public-env';

// Public data only (catalogue, v_session_availability, signed-URL uploads). It carries no session, not even a
// signed-in staff member's, so an island on the public site reads exactly what a visitor reads. Staff data
// and bookings never go through this client; ESLint bans it under src/app/(admin).
export function createSupabaseBrowserClient() {
  return createClient<Database>(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } },
  );
}
