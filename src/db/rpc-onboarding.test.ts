import { describe, expect, it } from 'vitest';
import { ZodError } from 'zod';

import {
  acceptStaffInvite,
  claimStaffInvite,
  readOnboardingState,
  unusedAccountOfInvite,
} from '@/db/rpc-onboarding';

import { clientAnswering } from '../../tests/fixtures/postgrest-client';

const SESSION = {
  userId: '0192f3a4-5b6c-7d8e-9f01-0000000000a1',
  sessionId: '0192f3a4-5b6c-7d8e-9f01-0000000000b2',
};
const ACCOUNT_ID = '0192f3a4-5b6c-7d8e-9f01-0000000000c3';

describe('claimStaffInvite and acceptStaffInvite', () => {
  it('send the verified ids and the hash, never a code', async () => {
    const { client, requests } = clientAnswering(200, { claimed: true });
    expect(await claimStaffInvite(client, SESSION, 'f'.repeat(64))).toBe(true);
    expect(requests[0]).toEqual({
      url: 'http://supabase.test/rest/v1/rpc/svc_claim_staff_invite',
      body: {
        p_user_id: SESSION.userId,
        p_session_id: SESSION.sessionId,
        p_invite_code_hash: 'f'.repeat(64),
      },
    });
  });

  it('read the one refusal and the acceptance', async () => {
    expect(
      await acceptStaffInvite(clientAnswering(200, { accepted: false }).client, SESSION, 'h'),
    ).toBe(false);
    expect(
      await acceptStaffInvite(
        clientAnswering(200, { accepted: true, role: 'admin_rw', rw_id: 5 }).client,
        SESSION,
        'h',
      ),
    ).toBe(true);
  });

  it('refuse a reply of another shape', async () => {
    await expect(
      claimStaffInvite(clientAnswering(200, { claimed: 'yes' }).client, SESSION, 'h'),
    ).rejects.toBeInstanceOf(ZodError);
  });
});

describe('unusedAccountOfInvite', () => {
  it('names the account to delete, or none', async () => {
    expect(await unusedAccountOfInvite(clientAnswering(200, ACCOUNT_ID).client, 'invite-1')).toBe(
      ACCOUNT_ID,
    );
    expect(await unusedAccountOfInvite(clientAnswering(200, null).client, 'invite-1')).toBeNull();
  });
});

describe('readOnboardingState', () => {
  it('reads the three booleans of onboarding_state()', async () => {
    const { client } = clientAnswering(200, [
      { invite_open: true, claim_held: false, factor_verified: true },
    ]);
    expect(await readOnboardingState(client)).toEqual({
      isInviteOpen: true,
      isClaimHeld: false,
      isFactorVerified: true,
    });
  });
});
