import { afterEach, describe, expect, it, vi } from 'vitest';

import { publicEnv } from '@/lib/public-env';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

const SESSION_TTL_SECONDS = 3600;

// A browser where a staff member is signed in: the auth cookie @supabase/ssr would read, holding a live session.
function signInStaffInThisBrowser() {
  const session = {
    access_token: 'staff-access-token',
    refresh_token: 'staff-refresh-token',
    token_type: 'bearer',
    expires_in: SESSION_TTL_SECONDS,
    expires_at: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
    user: {
      id: 'staff',
      aud: 'authenticated',
      role: 'authenticated',
      app_metadata: {},
      user_metadata: {},
    },
  };
  const cookieValue = 'base64-' + Buffer.from(JSON.stringify(session)).toString('base64url');
  const browserDocument = { cookie: `sb-127-auth-token=${cookieValue}` };
  vi.stubGlobal('document', browserDocument);
  vi.stubGlobal('window', {
    document: browserDocument,
    location: { href: 'http://127.0.0.1:3000/' },
  });
}

describe('createSupabaseBrowserClient', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reads as a visitor even in a browser where a staff member is signed in', async () => {
    signInStaffInThisBrowser();
    const fetchMock = vi.fn<typeof fetch>(() =>
      Promise.resolve(new Response('[]', { status: 200 })),
    );
    vi.stubGlobal('fetch', fetchMock);

    const { error } = await createSupabaseBrowserClient()
      .from('v_session_availability')
      .select('id');

    expect(error).toBeNull();
    const headers = new Headers(fetchMock.mock.calls[0]?.[1]?.headers);
    expect(headers.get('authorization')).toBe(`Bearer ${publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY}`);
  });
});
