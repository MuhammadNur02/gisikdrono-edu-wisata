'use client';

import dynamic from 'next/dynamic';

import { Skeleton } from '@/components/ui/skeleton';
import type { RwBadge } from '@/types/rw-unit';

// The list and the Supabase client it needs load after the page is on screen, so they stay out of the page's
// first-load script (CLAUDE.md §5.1, docs/StyleGuide.md §10.1 budget).
const AvailabilityList = dynamic(
  () => import('@/components/packages/availability-list').then((module) => module.AvailabilityList),
  { ssr: false, loading: () => <Skeleton className="h-44 w-full rounded-lg" /> },
);

export interface AvailabilityPreviewProps {
  // The RWs the package visits; a combo marks each session with its RW.
  rws: readonly RwBadge[];
}

// docs/PRD.md FR-PUB-12 (DESIGN-SPEC §3.5): the next 14 days of sessions in the booking panel.
export function AvailabilityPreview({ rws }: AvailabilityPreviewProps) {
  return (
    <section aria-labelledby="ketersediaan-judul" className="space-y-4">
      <AvailabilityList rws={rws} />
    </section>
  );
}
