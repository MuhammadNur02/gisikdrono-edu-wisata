import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@/db/types';

// A real typed session client whose fetch answers PostgREST from memory, for the CMS service tests: a read answers
// with `stored`, every write is recorded and answered with the stored row merged with what it wrote (as
// src/server/services/document-service.test.ts does with its own fetch).

export interface RecordedWrite {
  method: string;
  // The request's address, with the PostgREST filters a write named (`status=eq.archived`).
  url: string;
  body: Record<string, unknown>;
}

function recordOf(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null
    ? Object.fromEntries(Object.entries(value))
    : {};
}

function jsonReply(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

export function fakeSessionClient(stored: Record<string, unknown> | null): {
  client: SupabaseClient<Database>;
  writes: RecordedWrite[];
} {
  const writes: RecordedWrite[] = [];
  const fakeFetch: typeof fetch = (input, init) => {
    const method = init?.method ?? 'GET';
    if (method === 'GET') return Promise.resolve(jsonReply(stored));
    const body = recordOf(typeof init?.body === 'string' ? JSON.parse(init.body) : null);
    const url = decodeURIComponent(input instanceof Request ? input.url : String(input));
    writes.push({ method, url, body });
    return Promise.resolve(jsonReply({ ...stored, ...body }));
  };
  const client = createClient<Database>('http://supabase.test', 'test-key', {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: fakeFetch },
  });
  return { client, writes };
}
