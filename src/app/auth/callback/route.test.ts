import { beforeEach, describe, expect, it, vi } from 'vitest';

import { openEmailLinkSession } from '@/server/services/auth-service';
import { withinAuthCallbackLimit } from '@/server/services/staff-service';

import { GET, POST } from './route';

vi.mock('@/server/services/auth-service', () => ({ openEmailLinkSession: vi.fn() }));
vi.mock('@/server/services/staff-service', () => ({ withinAuthCallbackLimit: vi.fn() }));
vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
  requestIdFrom: () => 'request-1',
}));

const CALLBACK = 'http://127.0.0.1:3000/auth/callback';
const LINK_EXPIRED = '/login?info=link-expired';
const TRY_LATER = '/login?info=link-try-later';

function open(query: string): Response {
  return GET(new Request(`${CALLBACK}${query}`));
}

function press(body: string, headers: Record<string, string> = {}): Promise<Response> {
  return POST(
    new Request(CALLBACK, {
      method: 'POST',
      body,
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        'content-length': String(body.length),
        origin: 'http://127.0.0.1:3000',
        host: '127.0.0.1:3000',
        'x-real-ip': '203.0.113.7',
        ...headers,
      },
    }),
  );
}

beforeEach(() => {
  vi.mocked(openEmailLinkSession).mockReset().mockResolvedValue(true);
  vi.mocked(withinAuthCallbackLimit).mockReset().mockResolvedValue(true);
});

// L2 of the review of PR #77: a mail scanner following the link uses nothing.
describe('GET auth/callback', () => {
  it('sends the link on to the continue page without asking Supabase Auth anything', () => {
    const response = open('?token_hash=abc123&type=invite&next=%2Fdashboard');

    expect(response.status).toBe(303);
    expect(response.headers.get('Location')).toBe('/auth/continue?token_hash=abc123&type=invite');
    expect(openEmailLinkSession).not.toHaveBeenCalled();
    expect(withinAuthCallbackLimit).not.toHaveBeenCalled();
  });

  it.each([
    ['no token', '?type=recovery'],
    ['another kind of link', '?token_hash=abc&type=magiclink'],
    ['an overlong token', `?token_hash=${'a'.repeat(513)}&type=recovery`],
    // The PKCE links of the earlier flow tied the reset to one browser and wrote its cookie on /forgot-password.
    ['an old PKCE code', '?code=abc'],
  ])('sends %s back to sign in', (_case, query) => {
    expect(open(query).headers.get('Location')).toBe(LINK_EXPIRED);
  });
});

describe('POST auth/callback', () => {
  it('opens the session of a recovery link and goes on to the new password', async () => {
    const response = await press('token_hash=pkce_abc123&type=recovery');

    expect(response.status).toBe(303);
    expect(response.headers.get('Location')).toBe('/reset-password');
    expect(openEmailLinkSession).toHaveBeenCalledWith('recovery', 'pkce_abc123');
    expect(withinAuthCallbackLimit).toHaveBeenCalledWith('203.0.113.7');
  });

  // Task P4.8.01: an invite link opens the mailbox's session and goes to /onboarding, never to a page it names.
  it('opens the session of an invite link and goes on to onboarding', async () => {
    const response = await press('token_hash=invite_abc123&type=invite&next=%2Fdashboard');

    expect(response.headers.get('Location')).toBe('/onboarding');
    expect(openEmailLinkSession).toHaveBeenCalledWith('invite', 'invite_abc123');
  });

  it('sends a used or expired link back to sign in', async () => {
    vi.mocked(openEmailLinkSession).mockResolvedValue(false);

    expect((await press('token_hash=abc&type=recovery')).headers.get('Location')).toBe(
      LINK_EXPIRED,
    );
  });

  it('refuses a press from another site before anything else', async () => {
    const response = await press('token_hash=abc&type=recovery', {
      origin: 'https://evil.example',
    });

    expect(response.status).toBe(403);
    expect(openEmailLinkSession).not.toHaveBeenCalled();
  });

  it('verifies nothing for a body that is no link form', async () => {
    expect((await press('token_hash=abc&type=magiclink')).headers.get('Location')).toBe(
      LINK_EXPIRED,
    );
    expect(
      (await press('{"token_hash":"abc"}', { 'content-type': 'application/json' })).headers.get(
        'Location',
      ),
    ).toBe(LINK_EXPIRED);
    expect(openEmailLinkSession).not.toHaveBeenCalled();
  });

  // I77-4 of the review of PR #77: a body without a declared length is read only up to the cap.
  it('reads no more than its cap of a body that declares no length', async () => {
    const response = await POST(
      new Request(CALLBACK, {
        method: 'POST',
        body: `token_hash=${'a'.repeat(4096)}&type=recovery`,
        headers: {
          'content-type': 'application/x-www-form-urlencoded',
          origin: 'http://127.0.0.1:3000',
          host: '127.0.0.1:3000',
        },
      }),
    );

    expect(response.headers.get('Location')).toBe(LINK_EXPIRED);
    expect(openEmailLinkSession).not.toHaveBeenCalled();
  });

  // RV-M1 of the independent review of PR #17: every verification reaches Supabase Auth from this server's IP, so a
  // flood of links from one visitor would use up Auth's per-IP verification limit for every staff member.
  it("asks Supabase Auth nothing once the visitor's IP is past its limit", async () => {
    vi.mocked(withinAuthCallbackLimit).mockResolvedValue(false);

    expect((await press('token_hash=abc&type=recovery')).headers.get('Location')).toBe(TRY_LATER);
    expect(openEmailLinkSession).not.toHaveBeenCalled();
  });

  it('asks Supabase Auth nothing when the limiter cannot be reached (fail-closed)', async () => {
    vi.mocked(withinAuthCallbackLimit).mockRejectedValue(new Error('database unavailable'));

    expect((await press('token_hash=abc&type=recovery')).headers.get('Location')).toBe(TRY_LATER);
    expect(openEmailLinkSession).not.toHaveBeenCalled();
  });
});
