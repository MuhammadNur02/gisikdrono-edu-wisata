'use client';

import type { TurnstileInstance } from '@marsidev/react-turnstile';
import type { RefObject } from 'react';

import { TurnstileField } from '@/components/forms/turnstile-field';
import { Button } from '@/components/ui/button';

export interface CaptchaSubmitProps {
  // From useTurnstileToken.
  captcha: { ref: RefObject<TurnstileInstance | undefined>; onToken: (token: string) => void };
  // Turnstile's action name for the form, such as `login`.
  action: string;
  error?: string | undefined;
  label: string;
  isBusy: boolean;
}

// The end of every sign-in form: the Turnstile widget, then the one primary button (docs/StyleGuide.md §5.6).
export function CaptchaSubmit({ captcha, action, error, label, isBusy }: CaptchaSubmitProps) {
  return (
    <>
      <TurnstileField ref={captcha.ref} action={action} onToken={captcha.onToken} error={error} />
      <Button type="submit" size="lg" className="w-full" loading={isBusy}>
        {label}
      </Button>
    </>
  );
}
