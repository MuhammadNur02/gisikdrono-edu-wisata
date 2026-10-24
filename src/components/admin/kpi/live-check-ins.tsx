'use client';

import { useEffect, useState } from 'react';

import { CHECKINS_REFRESH_MS } from '@/config/dashboard';
import type { ActionResult } from '@/types/action-result';

const numberFormat = new Intl.NumberFormat('id-ID');

export interface LiveCheckInsProps {
  // The count the server rendered with the page.
  initial: number;
  // readCheckInsTodayAction, handed down by the page (components never import src/server).
  read: () => Promise<ActionResult<number>>;
}

// Task P4.2.02: today's check-in count, re-read through a read-only Server Action every 15 s while the tab is
// visible, never through the browser client. A failed read keeps the last figure; the next tick tries again.
export function LiveCheckIns({ initial, read }: LiveCheckInsProps) {
  const [count, setCount] = useState(initial);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.hidden) return;
      void read().then((result) => {
        if (result.ok) setCount(result.data);
      });
    }, CHECKINS_REFRESH_MS);
    return () => {
      window.clearInterval(timer);
    };
  }, [read]);

  return (
    <span aria-live="polite" aria-atomic="true" className="tabular-nums">
      {numberFormat.format(count)}
    </span>
  );
}
