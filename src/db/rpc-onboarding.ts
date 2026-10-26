import 'server-only';

import { z } from 'zod';

import { resultOf, type DatabaseClient } from '@/db/rpc-result';

// /onboarding (Task P4.8.01, 20261103131000 to 20261103131200). The svc_ functions run on the service-role client of
// src/server/services/staff-service.ts with the ids of the verified session; onboarding_state() on the session
// client of the account being onboarded.

const claimedSchema = z.object({ claimed: z.boolean() }).strict();
const acceptedSchema = z
  .object({
    accepted: z.boolean(),
    role: z.enum(['superadmin', 'admin_rw']).optional(),
    rw_id: z.number().int().nullable().optional(),
  })
  .strict();
const onboardingStateSchema = z
  .array(
    z
      .object({ invite_open: z.boolean(), claim_held: z.boolean(), factor_verified: z.boolean() })
      .strict(),
  )
  .length(1);

export interface OnboardingSession {
  userId: string;
  sessionId: string;
}

export interface OnboardingState {
  isInviteOpen: boolean;
  isClaimHeld: boolean;
  isFactorVerified: boolean;
}

// True once the code bound its invite to this session; every refusal reads false (docs/Security.md §5.1).
export async function claimStaffInvite(
  adminClient: DatabaseClient,
  session: OnboardingSession,
  inviteCodeHash: string,
): Promise<boolean> {
  const reply = await resultOf(
    adminClient.rpc('svc_claim_staff_invite', {
      p_user_id: session.userId,
      p_session_id: session.sessionId,
      p_invite_code_hash: inviteCodeHash,
    }),
  );
  return claimedSchema.parse(reply).claimed;
}

// True once the invite's role is the account's; the database has ended every session of the account by then.
export async function acceptStaffInvite(
  adminClient: DatabaseClient,
  session: OnboardingSession,
  inviteCodeHash: string,
): Promise<boolean> {
  const reply = await resultOf(
    adminClient.rpc('svc_accept_staff_invite', {
      p_user_id: session.userId,
      p_session_id: session.sessionId,
      p_invite_code_hash: inviteCodeHash,
    }),
  );
  return acceptedSchema.parse(reply).accepted;
}

// After a revoke: the Auth user that never became staff and has no open invite left, or null.
export async function unusedAccountOfInvite(
  adminClient: DatabaseClient,
  inviteId: string,
): Promise<string | null> {
  const reply = await resultOf(
    adminClient.rpc('svc_unused_account_of_invite', { p_invite_id: inviteId }),
  );
  return z.uuid().nullable().parse(reply);
}

export async function readOnboardingState(client: DatabaseClient): Promise<OnboardingState> {
  const [state] = onboardingStateSchema.parse(await resultOf(client.rpc('onboarding_state')));
  return {
    isInviteOpen: state?.invite_open ?? false,
    isClaimHeld: state?.claim_held ?? false,
    isFactorVerified: state?.factor_verified ?? false,
  };
}
