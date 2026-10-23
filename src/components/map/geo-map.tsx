'use client';

import dynamic from 'next/dynamic';

import { Skeleton } from '@/components/ui/skeleton';

// docs/StyleGuide.md §10.1: Leaflet reaches the browser only where a map is shown, after the page itself, behind a
// skeleton of the map's proportions (next/dynamic with ssr: false must sit in a client file).
export const GeoMap = dynamic(
  () => import('@/components/map/leaflet-map').then((module) => module.LeafletMap),
  { ssr: false, loading: () => <Skeleton className="aspect-video w-full rounded-xl" /> },
);
