import { LogOut } from 'lucide-react';

import { Button, type ButtonProps } from '@/components/ui/button';
import { SIGN_OUT_PATH } from '@/config/auth';
import { copy } from '@/lib/copy/id';

export interface SignOutButtonProps {
  variant?: ButtonProps['variant'];
  className?: string;
}

// A plain form post to auth/signout, so signing out works before any script has loaded (docs/Security.md §5.4).
export function SignOutButton({ variant = 'outline', className }: SignOutButtonProps) {
  return (
    <form action={SIGN_OUT_PATH} method="post" className={className}>
      <Button type="submit" variant={variant} className="w-full">
        <LogOut aria-hidden />
        {copy.auth.mfa.signOut}
      </Button>
    </form>
  );
}
