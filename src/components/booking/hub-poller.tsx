'use client';

import { LoaderCircle } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

// docs/PRD.md FR-BOOK-11 (decision of 2026-10-24, Q4): while a payment is pending the hub reads the database again every
// 5 s through the server, never Snap's redirect query, so the page turns to Lunas once the webhook or the poll has
// booked the payment.
const REFRESH_MS = 5000;

export function HubPoller({ label }: { label: string }) {
  const router = useRouter();
  useEffect(() => {
    const timer = setInterval(() => {
      router.refresh();
    }, REFRESH_MS);
    return () => {
      clearInterval(timer);
    };
  }, [router]);
  return (
    <p className="flex items-center gap-2.5 text-body-sm text-ink-2">
      <LoaderCircle aria-hidden className="size-4.5 shrink-0 text-info motion-safe:animate-spin" />
      {label}
    </p>
  );
}
