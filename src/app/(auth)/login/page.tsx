import type { Metadata } from 'next';

import { AuthCard } from '@/components/auth/auth-card';
import { NoAccessNotice } from '@/components/auth/no-access-notice';
import { SignInForm } from '@/components/auth/sign-in-form';
import { FormAlert } from '@/components/forms/form-alert';
import { copy } from '@/lib/copy/id';
import { loginNoticeFrom, singleSearchValue } from '@/lib/utils/staff-paths';
import { signInAction } from '@/server/actions/auth';
import { readStaffSession } from '@/server/auth/guards';
import { redirectSignedInStaff } from '@/server/auth/session';

const text = copy.auth.signIn;

export const metadata: Metadata = { title: text.title };

interface LoginPageProps {
  searchParams: Promise<{ next?: string | string[]; info?: string | string[] }>;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const next = singleSearchValue(params.next);
  const session = await readStaffSession();
  redirectSignedInStaff(session, next);
  if (session) return <NoAccessNotice />;

  const notice = loginNoticeFrom(params.info);
  return (
    <AuthCard title={text.title} description={text.description}>
      {notice ? <FormAlert tone="info">{text.notices[notice]}</FormAlert> : null}
      <SignInForm action={signInAction} next={next} />
    </AuthCard>
  );
}
