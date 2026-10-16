import 'server-only';

import { createClient } from '@supabase/supabase-js';

import type { Database } from '@/db/types';
import { publicEnv } from '@/lib/public-env';

// The public website reads as a visitor does: the anon key and no session, never the cookie of whoever is
// signed in. A staff member therefore sees exactly the site a visitor sees, and a read can be cached for
// everyone (CLAUDE.md §5.5). Only src/lib/queries imports this, which ESLint enforces.
export function createSupabaseAnonClient() {
  return createClient<Database>(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } },
  );
}
