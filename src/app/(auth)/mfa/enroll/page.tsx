import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { AuthCard } from '@/components/auth/auth-card';
import { MfaEnrolForm } from '@/components/auth/mfa-enrol-form';
import { NoAccessNotice } from '@/components/auth/no-access-notice';
import { SignOutButton } from '@/components/auth/sign-out-button';
import { LOGIN_PATH, MFA_VERIFY_PATH, ONBOARDING_PATH } from '@/config/auth';
import { copy } from '@/lib/copy/id';
import { pathWithNext, singleSearchValue, staffNextPath } from '@/lib/utils/staff-paths';
import { confirmMfaEnrolmentAction, startMfaEnrolmentAction } from '@/server/actions/mfa';
import { readStaffSession } from '@/server/auth/guards';
import { readOnboardingStateOfSession } from '@/server/services/auth-service';
import { reenrolmentStateOf } from '@/server/services/staff-service';

const text = copy.auth.mfa;

export const metadata: Metadata = { title: text.enrollTitle };

interface MfaEnrollPageProps {
  searchParams: Promise<{ next?: string | string[] }>;
}

// Task P2.8.02: offered only while the account has no verified TOTP factor (docs/Security.md §5.2, AUTH-12). With
// one, the code is asked for instead; a second factor is never added here.
export default async function MfaEnrollPage({ searchParams }: MfaEnrollPageProps) {
  const next = singleSearchValue((await searchParams).next);
  const session = await readStaffSession();
  if (!session) redirect(pathWithNext(LOGIN_PATH, next));
  // O4 of the onboarding review: an account still being onboarded goes on there, where its invite code comes first.
  // Task P4.8.05: an account whose authenticator was reset has no role until its new one is verified.
  const reenrolment = session.ctx.role === 'none' ? await reenrolmentStateOf(session.ctx.userId) : 'none';
  if (session.ctx.role === 'none' && reenrolment === 'none') {
    if ((await readOnboardingStateOfSession()).isInviteOpen) redirect(ONBOARDING_PATH);
    return <NoAccessNotice />;
  }
  if (session.hasVerifiedTotp) {
    redirect(session.ctx.isAal2 ? staffNextPath(next) : pathWithNext(MFA_VERIFY_PATH, next));
  }

  return (
    <AuthCard
      title={text.enrollTitle}
      description={reenrolment === 'none' ? text.enrollDescription : text.reenrolDescription}
    >
      <MfaEnrolForm
        startAction={startMfaEnrolmentAction}
        confirmAction={confirmMfaEnrolmentAction}
        next={next}
        needsReenrolmentCode={reenrolment === 'needs_code'}
      />
      <SignOutButton variant="ghost" />
    </AuthCard>
  );
}
