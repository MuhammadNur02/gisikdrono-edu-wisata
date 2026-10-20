import { beforeEach, describe, expect, it, vi } from 'vitest';

import { readStaffSession, type StaffSession } from '@/server/auth/guards';
import { signOutEverywhere } from '@/server/services/auth-service';
import { recordSessionRevokeFailure } from '@/server/services/staff-service';

import { POST } from './route';

vi.mock('@/server/auth/guards', () => ({ readStaffSession: vi.fn() }));
vi.mock('@/server/services/auth-service', () => ({ signOutEverywhere: vi.fn() }));
vi.mock('@/server/services/staff-service', () => ({ recordSessionRevokeFailure: vi.fn() }));

const SESSION: StaffSession = {
  ctx: {
    userId: 'user-1',
    role: 'superadmin',
    rwId: null,
    isAal2: true,
    totpVerifiedAt: null,
    claimsVersion: 1,
  },
  hasVerifiedTotp: true,
  authMethods: ['password', 'totp'],
};

function signOut(origin = 'http://127.0.0.1:3000'): Promise<Response> {
  return POST(
    new Request('http://localhost:3000/auth/signout', {
      method: 'POST',
      headers: { origin, host: '127.0.0.1:3000', 'x-vercel-id': 'request-1' },
    }),
  );
}

beforeEach(() => {
  vi.mocked(readStaffSession).mockReset().mockResolvedValue(SESSION);
  vi.mocked(signOutEverywhere).mockReset().mockResolvedValue(true);
  vi.mocked(recordSessionRevokeFailure).mockReset().mockResolvedValue(undefined);
});

describe('POST auth/signout', () => {
  it('ends every session and goes to sign in', async () => {
    const response = await signOut();

    expect(response.status).toBe(303);
    expect(response.headers.get('Location')).toBe('/login');
    expect(recordSessionRevokeFailure).not.toHaveBeenCalled();
  });

  // S1 of the PR #17 review: this browser is signed out either way, the other devices may not be.
  it('records it and says so when the other sessions could not be ended', async () => {
    vi.mocked(signOutEverywhere).mockResolvedValue(false);

    const response = await signOut();

    expect(response.headers.get('Location')).toBe('/login?info=signed-out-here-only');
    expect(recordSessionRevokeFailure).toHaveBeenCalledWith(SESSION.ctx, 'sign_out', 'request-1');
  });

  it('refuses a post from another site', async () => {
    expect((await signOut('https://evil.example')).status).toBe(403);
    expect(signOutEverywhere).not.toHaveBeenCalled();
  });
});
