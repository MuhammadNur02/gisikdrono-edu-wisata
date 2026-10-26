import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { AuthCard } from '@/components/auth/auth-card';
import { OnboardingForm } from '@/components/auth/onboarding-form';
import { SignOutButton } from '@/components/auth/sign-out-button';
import { DASHBOARD_PATH, LOGIN_PATH } from '@/config/auth';
import { copy } from '@/lib/copy/id';
import { claimInviteAction, completeOnboardingAction } from '@/server/actions/onboarding';
import { readStaffSession } from '@/server/auth/guards';
import { readOnboardingStateOfSession } from '@/server/services/auth-service';

const text = copy.auth.onboarding;

export const metadata: Metadata = { title: text.title };

// Task P4.8.01 (docs/Security.md §5.1): reached from the invite email through auth/callback, or from /login and the
// MFA steps for an account still being onboarded. The form appears only while an invite for the account's address
// is open; the database decides that, and every step again.
export default async function OnboardingPage() {
  const session = await readStaffSession();
  if (!session) redirect(LOGIN_PATH);
  if (session.ctx.role !== 'none') redirect(DASHBOARD_PATH);
  const state = await readOnboardingStateOfSession();
  if (!state.isInviteOpen) {
    return (
      <AuthCard title={text.noInviteTitle} description={text.noInvite}>
        <SignOutButton />
      </AuthCard>
    );
  }

  return (
    <AuthCard title={text.title} description={text.description}>
      <OnboardingForm claimAction={claimInviteAction} completeAction={completeOnboardingAction} />
      <SignOutButton variant="ghost" />
    </AuthCard>
  );
}
