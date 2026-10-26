import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { AuthCard } from '@/components/auth/auth-card';
import { Button } from '@/components/ui/button';
import { AUTH_CALLBACK_PATH, LOGIN_NOTICE_PARAM, LOGIN_PATH } from '@/config/auth';
import { copy } from '@/lib/copy/id';
import { parseEmailLink } from '@/lib/utils/email-link';
import { singleSearchValue } from '@/lib/utils/staff-paths';

const text = copy.auth.emailLink;

export const metadata: Metadata = { title: text.inviteTitle };

interface ContinueEmailLinkPageProps {
  searchParams: Promise<{ token_hash?: string | string[]; type?: string | string[] }>;
}

// L2 of the review of PR #77 (docs/Security.md §5.1, R27): /auth/callback sends an email link here, and only this
// button, a POST back to /auth/callback, uses it. A mail scanner that opens every link leaves it unused. A plain form,
// so it works before any script has loaded.
export default async function ContinueEmailLinkPage({ searchParams }: ContinueEmailLinkPageProps) {
  const params = await searchParams;
  const link = parseEmailLink(singleSearchValue(params.token_hash), singleSearchValue(params.type));
  if (!link) redirect(`${LOGIN_PATH}?${LOGIN_NOTICE_PARAM}=link-expired`);

  return (
    <AuthCard
      title={link.type === 'invite' ? text.inviteTitle : text.recoveryTitle}
      description={text.description}
    >
      <form method="post" action={AUTH_CALLBACK_PATH}>
        <input type="hidden" name="token_hash" value={link.tokenHash} />
        <input type="hidden" name="type" value={link.type} />
        <Button type="submit" size="lg" className="w-full">
          {text.submit}
        </Button>
      </form>
    </AuthCard>
  );
}
