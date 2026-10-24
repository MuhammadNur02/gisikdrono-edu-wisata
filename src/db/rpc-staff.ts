import 'server-only';

import { z } from 'zod';

import { resultOf, type DatabaseClient } from '@/db/rpc-result';

// The staff RPCs src/db/rpc.ts has no room for (Task P4.8.02). They run on the signed-in superadmin's session client,
// so auth.uid(), the fresh-TOTP check and RLS apply.

const superadminInviteSchema = z
  .object({
    stage: z.literal('requested'),
    invite_id: z.uuid(),
    completes_after: z.string(),
    lapses_after: z.string(),
  })
  .strict();

export interface SuperadminInvite {
  inviteId: string;
  // When it may be accepted (24 hours after the request) and when it expires (72 hours).
  completesAfter: string;
  lapsesAfter: string;
}

// A superadmin is invited only through invite_superadmin, never by a plain insert (staff_invites_guard, 0005).
export async function inviteSuperadmin(
  client: DatabaseClient,
  invite: { email: string; inviteCodeHash: string },
): Promise<SuperadminInvite> {
  const reply = await resultOf(
    client.rpc('invite_superadmin', {
      p_email: invite.email,
      p_invite_code_hash: invite.inviteCodeHash,
    }),
  );
  const result = superadminInviteSchema.parse(reply);
  return {
    inviteId: result.invite_id,
    completesAfter: result.completes_after,
    lapsesAfter: result.lapses_after,
  };
}
