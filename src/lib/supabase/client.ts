import { createBrowserClient } from '@supabase/ssr';

import type { Database } from '@/db/types';
import { publicEnv } from '@/lib/public-env';

// Public data only (catalogue, v_session_availability, signed-URL uploads). Staff data and
// bookings never go through this client; ESLint bans it under src/app/(admin).
export function createSupabaseBrowserClient() {
  return createBrowserClient<Database>(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}
