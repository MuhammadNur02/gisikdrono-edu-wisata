'use client';

import dynamic from 'next/dynamic';

import { Skeleton } from '@/components/ui/skeleton';
import { OSM_COPYRIGHT_URL } from '@/config/map';
import { mapCopy } from '@/lib/copy/map';
import type { RwPin } from '@/types/map';

// Leaflet reaches the browser only after the page, behind a skeleton of the frame (docs/StyleGuide.md §10.1), so it
// never counts against the home page's first-load budget; next/dynamic with ssr: false must sit in a client file.
const RwPinsLeaflet = dynamic(
  () => import('@/components/map/rw-pins-leaflet').then((module) => module.RwPinsLeaflet),
  { ssr: false, loading: () => <Skeleton className="size-full rounded-none" /> },
);

export interface RwPinsMapProps {
  pins: readonly RwPin[];
  // Names the map for a screen reader; the pins are links inside it.
  label: string;
}

// The framed map of the home page's contact block (DESIGN-SPEC §3.1): radius 16, a hairline, the OpenStreetMap credit
// in its bottom corner as the tile policy asks.
export function RwPinsMap({ pins, label }: RwPinsMapProps) {
  return (
    <div
      role="group"
      aria-label={label}
      className="relative isolate h-75 overflow-hidden rounded-xl border border-border map-tiles-warm md:h-110 lg:h-140"
    >
      <RwPinsLeaflet pins={pins} />
      <p className="absolute right-3 bottom-3 z-10 rounded-sm bg-card/90 px-2 py-0.5 text-xs text-ink-2">
        ©{' '}
        <a
          href={OSM_COPYRIGHT_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="underline-offset-2 hover:underline"
        >
          {mapCopy.osmContributors}
        </a>
      </p>
    </div>
  );
}
