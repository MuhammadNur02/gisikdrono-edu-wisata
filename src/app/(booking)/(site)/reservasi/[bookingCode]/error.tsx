'use client';

import { RotateCcw } from 'lucide-react';
import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { GUEST_BOOKING_PATH } from '@/config/guest';
import { bookingHubErrorCopy as text } from '@/lib/copy/booking-hub';

// DESIGN-SPEC §3.11: the hub could not load. An error boundary is a client component, so it takes only its own lines.
export default function StatusHubError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <section
      role="alert"
      className="w-full max-w-160 space-y-4 rounded-2xl border border-border bg-card p-6 text-center md:p-10"
    >
      <h1 className="text-h3 text-balance">{text.title}</h1>
      <p className="text-body text-ink-2">{text.body}</p>
      <div className="flex flex-wrap justify-center gap-3">
        <Button onClick={reset}>
          <RotateCcw aria-hidden />
          {text.retry}
        </Button>
        <Button asChild variant="outline">
          <Link href={`${GUEST_BOOKING_PATH}/cari`}>{text.find}</Link>
        </Button>
      </div>
    </section>
  );
}
