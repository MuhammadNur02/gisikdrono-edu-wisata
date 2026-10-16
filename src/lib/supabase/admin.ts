import 'server-only';

import { createClient } from '@supabase/supabase-js';
import { experimental_taintUniqueValue as taintUniqueValue } from 'react';

import type { Database } from '@/db/types';
import { serverEnv } from '@/lib/env';
import { publicEnv } from '@/lib/public-env';

// Service role bypasses RLS. Only the allow-listed modules in CLAUDE.md §6.1 may import this, and
// each query must be filtered by an id taken from a verified token, signature or CRON_SECRET.

// If either secret ever ends up in a prop sent to a Client Component, React throws instead of leaking it.
taintUniqueValue(
  'The Supabase service-role key must never reach the browser.',
  process,
  serverEnv.SUPABASE_SERVICE_ROLE_KEY,
);
taintUniqueValue('CRON_SECRET must never reach the browser.', process, serverEnv.CRON_SECRET);

export function createSupabaseAdminClient() {
  return createClient<Database>(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    serverEnv.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
}
