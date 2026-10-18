'use client';

import dynamic from 'next/dynamic';

import { Skeleton } from '@/components/ui/skeleton';
import type { RwId } from '@/config/rw';
import { copy } from '@/lib/copy/id';

// The list and the Supabase client it needs load after the page is on screen, so they stay out of the page's
// first-load script (CLAUDE.md §5.1, docs/StyleGuide.md §10.1 budget).
const AvailabilityList = dynamic(
  () => import('@/components/packages/availability-list').then((module) => module.AvailabilityList),
  { ssr: false, loading: () => <Skeleton className="h-16 w-full" /> },
);

export interface AvailabilityPreviewProps {
  rwIds: readonly RwId[];
}

// docs/PRD.md FR-PUB-12: the next 14 days of sessions on the package page.
export function AvailabilityPreview({ rwIds }: AvailabilityPreviewProps) {
  return (
    <section aria-labelledby="ketersediaan-judul" aria-live="polite" className="space-y-3">
      <h2 id="ketersediaan-judul" className="text-h4">
        {copy.catalogue.availabilityTitle}
      </h2>
      <AvailabilityList rwIds={rwIds} />
    </section>
  );
}
