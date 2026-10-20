import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { AuthCard } from '@/components/auth/auth-card';
import { MfaEnrolForm } from '@/components/auth/mfa-enrol-form';
import { NoAccessNotice } from '@/components/auth/no-access-notice';
import { SignOutButton } from '@/components/auth/sign-out-button';
import { LOGIN_PATH, MFA_VERIFY_PATH } from '@/config/auth';
import { copy } from '@/lib/copy/id';
import { pathWithNext, singleSearchValue, staffNextPath } from '@/lib/utils/staff-paths';
import { confirmMfaEnrolmentAction, startMfaEnrolmentAction } from '@/server/actions/mfa';
import { readStaffSession } from '@/server/auth/guards';

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
  if (session.ctx.role === 'none') return <NoAccessNotice />;
  if (session.hasVerifiedTotp) {
    redirect(session.ctx.isAal2 ? staffNextPath(next) : pathWithNext(MFA_VERIFY_PATH, next));
  }

  return (
    <AuthCard title={text.enrollTitle} description={text.enrollDescription}>
      <MfaEnrolForm
        startAction={startMfaEnrolmentAction}
        confirmAction={confirmMfaEnrolmentAction}
        next={next}
      />
      <SignOutButton variant="ghost" />
    </AuthCard>
  );
}
