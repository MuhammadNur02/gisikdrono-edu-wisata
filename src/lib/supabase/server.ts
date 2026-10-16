import 'server-only';

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

import { AUTH_COOKIE_OPTIONS } from '@/config/auth';
import type { Database } from '@/db/types';
import { publicEnv } from '@/lib/public-env';

// Runs every query as the signed-in staff member (or anon), so RLS decides what comes back.
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();
  return createServerClient<Database>(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookieOptions: AUTH_COOKIE_OPTIONS,
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet) => {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Server Components may not set cookies. That is fine: src/middleware.ts already
            // refreshed the session on this request and wrote the new cookies.
          }
        },
      },
    },
  );
}
