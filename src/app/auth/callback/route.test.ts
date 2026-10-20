import { beforeEach, describe, expect, it, vi } from 'vitest';

import { openRecoverySession } from '@/server/services/auth-service';
import { withinAuthCallbackLimit } from '@/server/services/staff-service';

import { GET } from './route';

vi.mock('@/server/services/auth-service', () => ({ openRecoverySession: vi.fn() }));
vi.mock('@/server/services/staff-service', () => ({ withinAuthCallbackLimit: vi.fn() }));
vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
  requestIdFrom: () => 'request-1',
}));

const CALLBACK = 'http://127.0.0.1:3000/auth/callback';
const LINK_EXPIRED = '/login?info=link-expired';
const TRY_LATER = '/login?info=link-try-later';

function open(query: string): Promise<Response> {
  return GET(new Request(`${CALLBACK}${query}`, { headers: { 'x-real-ip': '203.0.113.7' } }));
}

beforeEach(() => {
  vi.mocked(openRecoverySession).mockReset().mockResolvedValue(true);
  vi.mocked(withinAuthCallbackLimit).mockReset().mockResolvedValue(true);
});

describe('GET auth/callback', () => {
  it('opens the session of a recovery link and goes on to the new password', async () => {
    const response = await open('?token_hash=pkce_abc123&type=recovery');

    expect(response.status).toBe(303);
    expect(response.headers.get('Location')).toBe('/reset-password');
    expect(openRecoverySession).toHaveBeenCalledWith('pkce_abc123');
    expect(withinAuthCallbackLimit).toHaveBeenCalledWith('203.0.113.7');
  });

  it('sends a used or expired link back to sign in', async () => {
    vi.mocked(openRecoverySession).mockResolvedValue(false);

    expect((await open('?token_hash=abc&type=recovery')).headers.get('Location')).toBe(
      LINK_EXPIRED,
    );
  });

  // RV-M1 of the independent review of PR #17: every verification reaches Supabase Auth from this server's IP, so a
  // flood of links from one visitor would use up Auth's per-IP verification limit for every staff member.
  it("asks Supabase Auth nothing once the visitor's IP is past its limit", async () => {
    vi.mocked(withinAuthCallbackLimit).mockResolvedValue(false);

    expect((await open('?token_hash=abc&type=recovery')).headers.get('Location')).toBe(TRY_LATER);
    expect(openRecoverySession).not.toHaveBeenCalled();
  });

  it('asks Supabase Auth nothing when the limiter cannot be reached (fail-closed)', async () => {
    vi.mocked(withinAuthCallbackLimit).mockRejectedValue(new Error('database unavailable'));

    expect((await open('?token_hash=abc&type=recovery')).headers.get('Location')).toBe(TRY_LATER);
    expect(openRecoverySession).not.toHaveBeenCalled();
  });

  it.each([
    ['no token', '?type=recovery'],
    ['another kind of link', '?token_hash=abc&type=magiclink'],
    ['an overlong token', `?token_hash=${'a'.repeat(513)}&type=recovery`],
    // The PKCE links of the earlier flow tied the reset to one browser and wrote its cookie on /forgot-password.
    ['an old PKCE code', '?code=abc'],
  ])('verifies and counts nothing for %s', async (_case, query) => {
    expect((await open(query)).headers.get('Location')).toBe(LINK_EXPIRED);
    expect(openRecoverySession).not.toHaveBeenCalled();
    expect(withinAuthCallbackLimit).not.toHaveBeenCalled();
  });
});
