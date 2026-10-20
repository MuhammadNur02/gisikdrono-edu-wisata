import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { AuthCard } from '@/components/auth/auth-card';
import { MfaVerifyForm } from '@/components/auth/mfa-verify-form';
import { NoAccessNotice } from '@/components/auth/no-access-notice';
import { SignOutButton } from '@/components/auth/sign-out-button';
import { LOGIN_PATH, MFA_ENROLL_PATH } from '@/config/auth';
import { copy } from '@/lib/copy/id';
import { pathWithNext, singleSearchValue, staffNextPath } from '@/lib/utils/staff-paths';
import { verifyMfaAction } from '@/server/actions/mfa';
import { readStaffSession } from '@/server/auth/guards';

const text = copy.auth.mfa;

export const metadata: Metadata = { title: text.verifyTitle };

interface MfaVerifyPageProps {
  searchParams: Promise<{ next?: string | string[] }>;
}

// Task P2.8.02: the step between the password and the dashboard for an account with a verified factor.
export default async function MfaVerifyPage({ searchParams }: MfaVerifyPageProps) {
  const next = singleSearchValue((await searchParams).next);
  const session = await readStaffSession();
  if (!session) redirect(pathWithNext(LOGIN_PATH, next));
  if (session.ctx.role === 'none') return <NoAccessNotice />;
  if (session.ctx.isAal2) redirect(staffNextPath(next));
  if (!session.hasVerifiedTotp) redirect(pathWithNext(MFA_ENROLL_PATH, next));

  return (
    <AuthCard title={text.verifyTitle} description={text.verifyDescription}>
      <MfaVerifyForm action={verifyMfaAction} next={next} />
      <SignOutButton variant="ghost" />
    </AuthCard>
  );
}
