'use client';

import { MapPinned } from 'lucide-react';
import dynamic from 'next/dynamic';
import { useEffect, useRef, useState } from 'react';

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

// DESIGN-SPEC §4 (Home, map pins): the map loads as it nears the screen, a screenful before it is reached, so a visit
// that never scrolls that far fetches neither Leaflet nor a single tile.
const NEAR_VIEWPORT_MARGIN = '600px 0px';

function useIsNearViewport() {
  const ref = useRef<HTMLDivElement>(null);
  const [isNear, setIsNear] = useState(false);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        setIsNear(true);
        observer.disconnect();
      },
      { rootMargin: NEAR_VIEWPORT_MARGIN },
    );
    observer.observe(element);
    return () => {
      observer.disconnect();
    };
  }, []);
  return { ref, isNear };
}

// Until the map loads: the frame's sunken paper with the kawung texture and a map glyph, decorative.
function MapPlaceholder() {
  return (
    <div
      aria-hidden
      className="kawung flex size-full items-center justify-center bg-muted kawung-7 kawung-ink"
    >
      <MapPinned className="size-9 text-muted-foreground" strokeWidth={1.5} />
    </div>
  );
}

export interface RwPinsMapProps {
  pins: readonly RwPin[];
  // Names the map for a screen reader; the pins are links inside it.
  label: string;
}

// The framed map of the home page's contact block (DESIGN-SPEC §3.1): radius 16, a hairline, the OpenStreetMap credit
// in its bottom corner as the tile policy asks.
export function RwPinsMap({ pins, label }: RwPinsMapProps) {
  const { ref, isNear } = useIsNearViewport();
  return (
    <div
      ref={ref}
      role="group"
      aria-label={label}
      className="relative isolate h-75 overflow-hidden rounded-xl border border-border map-tiles-warm md:h-110 lg:h-140"
    >
      {isNear ? <RwPinsLeaflet pins={pins} /> : <MapPlaceholder />}
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
