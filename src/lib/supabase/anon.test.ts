import { afterEach, describe, expect, it, vi } from 'vitest';

import { publicEnv } from '@/lib/public-env';
import { createSupabaseAnonClient } from '@/lib/supabase/anon';

// If the public client ever reached for the request's cookies, the signed-in staff member's session would
// change what the public site shows.
vi.mock('next/headers', () => ({
  cookies: () => {
    throw new Error('the public site must not read the session cookie');
  },
}));

function stubFetch() {
  const fetchMock = vi.fn<typeof fetch>(() => Promise.resolve(new Response('[]', { status: 200 })));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('createSupabaseAnonClient', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reads as a visitor: the anon key, no session, no cookie', async () => {
    const fetchMock = stubFetch();

    const { error } = await createSupabaseAnonClient().from('tour_packages').select('id');

    expect(error).toBeNull();
    const headers = new Headers(fetchMock.mock.calls[0]?.[1]?.headers);
    expect(headers.get('authorization')).toBe(`Bearer ${publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY}`);
    expect(headers.get('cookie')).toBeNull();
  });

  it('keeps no session to send later', async () => {
    const { data } = await createSupabaseAnonClient().auth.getSession();

    expect(data.session).toBeNull();
  });
});
