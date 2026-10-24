import { describe, expect, it } from 'vitest';
import { ZodError } from 'zod';

import { inviteSuperadmin } from '@/db/rpc-staff';

import { clientAnswering } from '../../tests/fixtures/postgrest-client';

const INVITE_ID = '0192f3a4-5b6c-7d8e-9f01-0000000000ee';

describe('inviteSuperadmin', () => {
  const REQUESTED = {
    stage: 'requested',
    invite_id: INVITE_ID,
    completes_after: '2026-10-25T08:00:00+00:00',
    lapses_after: '2026-10-27T08:00:00+00:00',
  };

  it('sends the address and the hash, never a code, and reads when the invite may be accepted', async () => {
    const { client, requests } = clientAnswering(200, REQUESTED);
    await expect(
      inviteSuperadmin(client, { email: 'lurah@gisikdrono.id', inviteCodeHash: 'f'.repeat(64) }),
    ).resolves.toEqual({
      inviteId: INVITE_ID,
      completesAfter: '2026-10-25T08:00:00+00:00',
      lapsesAfter: '2026-10-27T08:00:00+00:00',
    });
    expect(requests[0]).toEqual({
      url: 'http://supabase.test/rest/v1/rpc/invite_superadmin',
      body: { p_email: 'lurah@gisikdrono.id', p_invite_code_hash: 'f'.repeat(64) },
    });
  });

  it('refuses a reply of another shape', async () => {
    const { client } = clientAnswering(200, { ...REQUESTED, stage: 'applied' });
    await expect(
      inviteSuperadmin(client, { email: 'lurah@gisikdrono.id', inviteCodeHash: 'f'.repeat(64) }),
    ).rejects.toBeInstanceOf(ZodError);
  });
});
