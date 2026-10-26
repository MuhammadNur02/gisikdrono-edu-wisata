import 'server-only';

import { z } from 'zod';

import { DB_ENUMS } from '@/db/enums';
import { fail } from '@/lib/errors';
import type { createSupabaseServerClient } from '@/lib/supabase/server';
import type { ActionFailure } from '@/types/action-result';

// The account /onboarding serves (Task P4.8.01): signed in, with no staff role in its token, and the session the JWT
// names. requireUser() stays closed to it; the database decides from the ids whether it is being onboarded at all
// (internal.is_never_staff), and AAL2 is checked again where it matters (completeOnboardingAction). Kept apart from
// guards.ts so auth-service.ts can read the context through the client that just lifted the session.
export type OnboardingContext = {
  userId: string;
  sessionId: string;
  isAal2: boolean;
  hasTotpMethod: boolean;
  verifiedFactorCount: number;
};

export type OnboardingGuardResult = { ok: true; ctx: OnboardingContext } | ActionFailure;

type SessionClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

const onboardingClaimsSchema = z.object({
  sub: z.string(),
  session_id: z.uuid(),
  app_role: z.enum(DB_ENUMS.app_role).default('none'),
  aal: z.enum(['aal1', 'aal2']),
  amr: z.array(z.object({ method: z.string(), timestamp: z.number() })).default([]),
});

export async function readOnboardingContext(
  supabase: SessionClient,
): Promise<OnboardingGuardResult> {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return fail('UNAUTHENTICATED');
  const { data: claimsData } = await supabase.auth.getClaims();
  const claims = onboardingClaimsSchema.safeParse(claimsData?.claims);
  if (!claims.success || claims.data.sub !== userData.user.id) return fail('UNAUTHENTICATED');
  if (claims.data.app_role !== 'none') return fail('FORBIDDEN');
  const factors = userData.user.factors ?? [];
  return {
    ok: true,
    ctx: {
      userId: userData.user.id,
      sessionId: claims.data.session_id,
      isAal2: claims.data.aal === 'aal2',
      hasTotpMethod: claims.data.amr.some((entry) => entry.method === 'totp'),
      verifiedFactorCount: factors.filter((factor) => factor.status === 'verified').length,
    },
  };
}
