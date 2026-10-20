'use client';

import { Turnstile, type TurnstileInstance } from '@marsidev/react-turnstile';
import { useState, type Ref } from 'react';

import { copy } from '@/lib/copy/id';
import { publicEnv } from '@/lib/public-env';

export interface TurnstileFieldProps {
  // Which form the token is for; Cloudflare reports it with the token (letters, digits, - and _ only).
  action: string;
  // An empty string whenever the token is gone (expired or failed), so the form cannot send a stale one.
  onToken: (token: string) => void;
  // The form's own message for the field, such as "wait until the check is done".
  error?: string | undefined;
  // reset() fetches a new token after a submit used the last one: a token is good once.
  ref?: Ref<TurnstileInstance | undefined>;
}

// docs/StyleGuide.md §5.6: the Turnstile widget sits right before the submit button. The site key's widget mode
// (managed or invisible) is set in Cloudflare, so the same component serves both. The flexible size fills the
// form's width and needs 300 px of it.
export function TurnstileField({ action, onToken, error, ref }: TurnstileFieldProps) {
  const [problem, setProblem] = useState<string | null>(null);
  const message = problem ?? error;
  return (
    <div className="space-y-2">
      <Turnstile
        ref={ref}
        siteKey={publicEnv.NEXT_PUBLIC_TURNSTILE_SITE_KEY}
        aria-label={copy.auth.turnstile.label}
        options={{ action, theme: 'light', language: 'id', size: 'flexible' }}
        onSuccess={(token) => {
          setProblem(null);
          onToken(token);
        }}
        onExpire={() => {
          setProblem(copy.auth.turnstile.expired);
          onToken('');
        }}
        onError={() => {
          setProblem(copy.auth.turnstile.failed);
          onToken('');
        }}
      />
      {message ? (
        <p role="alert" className="text-caption text-destructive">
          {message}
        </p>
      ) : null}
    </div>
  );
}
