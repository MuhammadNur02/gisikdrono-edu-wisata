import type { ComponentProps } from 'react';

import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils/cn';

const TOTP_DIGITS = 6;

// Six digits from an authenticator app: the numeric keyboard on phones, and one-time-code so iOS and Android offer
// the code when the app shares it.
export function TotpCodeInput({ className, ...props }: ComponentProps<typeof Input>) {
  return (
    <Input
      {...props}
      inputMode="numeric"
      autoComplete="one-time-code"
      maxLength={TOTP_DIGITS}
      pattern="[0-9]*"
      className={cn('font-mono tracking-widest', className)}
    />
  );
}
