'use client';

import { useLinkStatus } from 'next/link';

import { cn } from '@/lib/utils/cn';

// Inside a <Link>: a small dot in the primary colour while the App Router fetches the next page (useLinkStatus,
// Next.js 15.3+), because the pages of (public)/(rows) carry no loading.tsx and the gallery renders per request
// (review of Task P5.6.05). It pulses on the tokens, stays still for a visitor who asked for less motion, and is
// hidden from readers, whom the page change itself tells. Positioned by the caller so it shifts nothing.
export function LinkPending({ className }: { className?: string }) {
  const { pending } = useLinkStatus();
  if (!pending) return null;
  return (
    <span
      aria-hidden
      className={cn('size-1.5 rounded-full bg-primary animate-pulse motion-reduce:animate-none', className)}
    />
  );
}
