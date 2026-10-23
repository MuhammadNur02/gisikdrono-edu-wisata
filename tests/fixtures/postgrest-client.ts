import { createClient } from '@supabase/supabase-js';

import type { Database } from '@/db/types';

// A real typed supabase-js client whose fetch answers every request with one reply, for the RPC wrappers of src/db:
// the test reads the request's address and body, and the wrapper parses the reply as it would from PostgREST.
export function clientAnswering(status: number, reply: unknown) {
  const requests: { url: string; body: unknown }[] = [];
  const fakeFetch: typeof fetch = (input, init) => {
    const url = input instanceof Request ? input.url : input.toString();
    requests.push({ url, body: typeof init?.body === 'string' ? JSON.parse(init.body) : null });
    const payload = status === 204 ? null : JSON.stringify(reply);
    return Promise.resolve(
      new Response(payload, { status, headers: { 'Content-Type': 'application/json' } }),
    );
  };
  const client = createClient<Database>('http://supabase.test', 'test-key', {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: fakeFetch },
  });
  return { client, requests };
}
