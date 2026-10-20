'use client';

import type { TurnstileInstance } from '@marsidev/react-turnstile';
import { useRef } from 'react';

// The Turnstile side of a form: the widget's handle, where its tokens go, and renew() after a submit, because a
// token is good for one check only.
export function useTurnstileToken(setToken: (token: string) => void) {
  const ref = useRef<TurnstileInstance | undefined>(undefined);
  return {
    ref,
    onToken: setToken,
    renew: () => {
      setToken('');
      ref.current?.reset();
    },
  };
}
