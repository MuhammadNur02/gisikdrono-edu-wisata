'use client';

import { useEffect, useState } from 'react';

const SECOND_MS = 1000;

// Seconds left of a wait that start() begins, such as the minute before another code may be sent. It reaches 0 and
// stops; the screen reader hears the change only where the caller puts it in an aria-live region.
export function useCountdown() {
  const [secondsLeft, setSecondsLeft] = useState(0);

  useEffect(() => {
    if (secondsLeft <= 0) return undefined;
    const timer = setTimeout(() => {
      setSecondsLeft((seconds) => Math.max(0, seconds - 1));
    }, SECOND_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [secondsLeft]);

  return { secondsLeft, start: setSecondsLeft };
}
