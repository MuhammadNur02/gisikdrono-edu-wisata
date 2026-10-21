import 'server-only';

import type { PostgrestSingleResponse, SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@/db/types';

// Shared by the typed RPC wrappers of src/db/rpc*.ts. Every call throws the PostgREST error unchanged, so mapError
// can read its code and hint.
export type DatabaseClient = SupabaseClient<Database>;

export async function resultOf<T>(request: PromiseLike<PostgrestSingleResponse<T>>): Promise<T> {
  const response = await request;
  if (response.error) throw response.error;
  return response.data;
}
