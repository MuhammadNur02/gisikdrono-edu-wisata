import { AuthCard } from '@/components/auth/auth-card';
import { SignOutButton } from '@/components/auth/sign-out-button';
import { copy } from '@/lib/copy/id';

// A signed-in account without a staff role: not yet onboarded, or deactivated with role 'none' (docs/Security.md
// §5.6). It sees this on every sign-in step and on the dashboard, never a form.
export function NoAccessNotice() {
  return (
    <AuthCard title={copy.auth.noAccess.title} description={copy.auth.noAccess.description}>
      <SignOutButton />
    </AuthCard>
  );
}
