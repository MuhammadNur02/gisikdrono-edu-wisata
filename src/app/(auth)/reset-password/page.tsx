import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { AuthCard } from '@/components/auth/auth-card';
import { NoAccessNotice } from '@/components/auth/no-access-notice';
import { ResetPasswordForm } from '@/components/auth/reset-password-form';
import {
  DASHBOARD_PATH,
  LOGIN_NOTICE_PARAM,
  LOGIN_PATH,
  RECOVERY_AUTH_METHOD,
} from '@/config/auth';
import { copy } from '@/lib/copy/id';
import { resetPasswordAction } from '@/server/actions/auth';
import { readStaffSession } from '@/server/auth/guards';

const text = copy.auth.reset;

export const metadata: Metadata = { title: text.title };

// Reached only through auth/callback with a recovery link (Task P2.8.01). Without that session there is nothing to
// reset here, and a staff member who is simply signed in goes back to the dashboard.
export default async function ResetPasswordPage() {
  const session = await readStaffSession();
  if (!session) redirect(`${LOGIN_PATH}?${LOGIN_NOTICE_PARAM}=link-expired`);
  if (!session.authMethods.includes(RECOVERY_AUTH_METHOD)) redirect(DASHBOARD_PATH);
  if (session.ctx.role === 'none') return <NoAccessNotice />;

  return (
    <AuthCard title={text.title} description={text.description}>
      <ResetPasswordForm
        action={resetPasswordAction}
        needsTotp={session.hasVerifiedTotp && !session.ctx.isAal2}
      />
    </AuthCard>
  );
}
