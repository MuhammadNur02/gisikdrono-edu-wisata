'use client';

import { useEffect, useState } from 'react';

// The time now, read again every intervalMs, for a page that waits on the clock: the booking summary asks for the
// WhatsApp code again once it is eight minutes old (decision of 2026-10-22 on P3.5, Q2).
export function useNow(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => {
      setNow(Date.now());
    }, intervalMs);
    return () => {
      clearInterval(timer);
    };
  }, [intervalMs]);
  return now;
}
