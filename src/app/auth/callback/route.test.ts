import { beforeEach, describe, expect, it, vi } from 'vitest';

import { openRecoverySession } from '@/server/services/auth-service';

import { GET } from './route';

vi.mock('@/server/services/auth-service', () => ({ openRecoverySession: vi.fn() }));

const CALLBACK = 'http://127.0.0.1:3000/auth/callback';
const LINK_EXPIRED = '/login?info=link-expired';

function open(query: string): Promise<Response> {
  return GET(new Request(`${CALLBACK}${query}`));
}

beforeEach(() => {
  vi.mocked(openRecoverySession).mockReset().mockResolvedValue(true);
});

describe('GET auth/callback', () => {
  it('opens the session of a recovery link and goes on to the new password', async () => {
    const response = await open('?token_hash=pkce_abc123&type=recovery');

    expect(response.status).toBe(303);
    expect(response.headers.get('Location')).toBe('/reset-password');
    expect(openRecoverySession).toHaveBeenCalledWith('pkce_abc123');
  });

  it('sends a used or expired link back to sign in', async () => {
    vi.mocked(openRecoverySession).mockResolvedValue(false);

    expect((await open('?token_hash=abc&type=recovery')).headers.get('Location')).toBe(
      LINK_EXPIRED,
    );
  });

  it.each([
    ['no token', '?type=recovery'],
    ['another kind of link', '?token_hash=abc&type=magiclink'],
    ['an overlong token', `?token_hash=${'a'.repeat(513)}&type=recovery`],
    // The PKCE links of the earlier flow tied the reset to one browser and wrote its cookie on /forgot-password.
    ['an old PKCE code', '?code=abc'],
  ])('verifies nothing for %s', async (_case, query) => {
    expect((await open(query)).headers.get('Location')).toBe(LINK_EXPIRED);
    expect(openRecoverySession).not.toHaveBeenCalled();
  });
});
