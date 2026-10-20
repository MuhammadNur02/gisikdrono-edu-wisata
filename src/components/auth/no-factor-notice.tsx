import { AuthCard } from '@/components/auth/auth-card';
import { SignOutButton } from '@/components/auth/sign-out-button';
import { copy } from '@/lib/copy/id';

const text = copy.auth.reset;

// A recovery link opened for an account without a verified authenticator (M2 of the PR #17 review): its mailbox alone
// would set a permanent password, so it gets no form, only the way to the superadmin (docs/Security.md R24, P4.8.05).
export function NoFactorNotice() {
  return (
    <AuthCard title={text.noFactorTitle} description={`${text.noFactorReason} ${text.noFactor}`}>
      <SignOutButton />
    </AuthCard>
  );
}
