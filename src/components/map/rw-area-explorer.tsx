'use client';

import dynamic from 'next/dynamic';
import { useCallback, useState, type ReactNode } from 'react';

import { RwAreaList } from '@/components/map/rw-area-list';
import { Skeleton } from '@/components/ui/skeleton';
import { OSM_COPYRIGHT_URL, RW_AREA_FRAME_CLASS } from '@/config/map';
import { NEUTRAL_ACCENT_CLASSES, rwAccentClasses, type RwId } from '@/config/rw';
import { mapCopy } from '@/lib/copy/map';
import { cn } from '@/lib/utils/cn';
import type { GeoMarker, RwAreaSelection, RwAreaSummary } from '@/types/map';

// docs/StyleGuide.md §10.1: Leaflet and the RW shapes reach the browser only after the page itself, behind a
// skeleton of the map's proportions, so neither counts against the public first-load budget (next/dynamic with
// ssr: false must sit in a client file). The list, the legend and the credit render on the server.
const RwAreaLeaflet = dynamic(
  () => import('@/components/map/rw-area-leaflet').then((module) => module.RwAreaLeaflet),
  { ssr: false, loading: () => <Skeleton className={cn('rounded-none', RW_AREA_FRAME_CLASS)} /> },
);

export interface RwAreaExplorerProps {
  // Every RW of the kelurahan's map, in number order (buildRwAreaSummaries).
  areas: readonly RwAreaSummary[];
  // The activity points with coordinates.
  markers: readonly GeoMarker[];
  officeRouteUrl: string;
}

function LegendItem({ swatch, label }: { swatch: ReactNode; label: string }) {
  return (
    <li className="flex items-center gap-2">
      <span aria-hidden className="flex w-5 shrink-0 justify-center">
        {swatch}
      </span>
      {label}
    </li>
  );
}

// What every map shows besides the RWs; the activity point swatch joins them once a point is drawn.
const FIXED_LEGEND = [
  {
    label: mapCopy.legendOtherRw,
    swatch: <span className={cn('size-3 rounded-sm', NEUTRAL_ACCENT_CLASSES.fill)} />,
  },
  {
    label: mapCopy.legendBoundary,
    swatch: <span className="w-5 border-t-2 border-dashed border-foreground" />,
  },
  {
    label: mapCopy.legendOffice,
    swatch: <span className="size-3 rounded-full bg-primary ring-2 ring-background" />,
  },
] as const;
const POINT_SWATCH = (
  <span className="size-2.5 rounded-full bg-muted-foreground ring-2 ring-background" />
);

function RwAreaLegend({
  areas,
  hasPoints,
}: {
  areas: readonly RwAreaSummary[];
  hasPoints: boolean;
}) {
  return (
    <ul
      aria-label={mapCopy.legendLabel}
      className="flex flex-wrap gap-x-5 gap-y-2 text-caption text-muted-foreground"
    >
      {areas.map((area) =>
        area.unit ? (
          <LegendItem
            key={area.rw}
            swatch={
              <span
                className={cn('size-3 rounded-sm', rwAccentClasses(area.unit.accentKey).fill)}
              />
            }
            label={`${area.label} ${area.unit.shortName}`}
          />
        ) : null,
      )}
      {FIXED_LEGEND.map((item) => (
        <LegendItem key={item.label} swatch={item.swatch} label={item.label} />
      ))}
      {hasPoints ? <LegendItem swatch={POINT_SWATCH} label={mapCopy.legendPoint} /> : null}
    </ul>
  );
}

// The kelurahan's map and the OSM tiles both need their credit next to the map; the estimate note stays while the
// drawn points still hold estimated positions (docs/content/konten-situs-kelurahan.md, section 8).
function RwAreaCredit({ hasEstimates }: { hasEstimates: boolean }) {
  return (
    <figcaption className="space-y-1 text-caption text-muted-foreground">
      <p>
        {mapCopy.areaSource} · {mapCopy.osmCredit} ©{' '}
        <a
          href={OSM_COPYRIGHT_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="underline underline-offset-4 hover:text-foreground"
        >
          {mapCopy.osmContributors}
        </a>
      </p>
      {hasEstimates ? <p>{mapCopy.pointsEstimated}</p> : null}
    </figcaption>
  );
}

// docs/PRD.md FR-PUB-18: the RW area map and the list that mirrors it share one selection. An area clicked on the
// map opens in the list; an RW opened in the list is highlighted and framed on the map.
export function RwAreaExplorer({ areas, markers, officeRouteUrl }: RwAreaExplorerProps) {
  const [selection, setSelection] = useState<RwAreaSelection | null>(null);
  const [hoveredRw, setHoveredRw] = useState<RwId | null>(null);
  const selectFromMap = useCallback((rw: RwId) => {
    setSelection({ rw, source: 'map' });
  }, []);
  const toggleFromList = useCallback((rw: RwId) => {
    setSelection((current) => (current?.rw === rw ? null : { rw, source: 'list' }));
  }, []);
  const hasPoints = markers.length > 0;
  return (
    <div className="grid gap-8 lg:grid-cols-3 lg:items-start">
      <figure className="space-y-3 lg:col-span-2">
        <div
          role="group"
          aria-label={mapCopy.areaLabel}
          className="relative isolate overflow-hidden rounded-xl border border-border"
        >
          <RwAreaLeaflet
            areas={areas}
            markers={markers}
            officeRouteUrl={officeRouteUrl}
            selection={selection}
            hoveredRw={hoveredRw}
            onSelect={selectFromMap}
            onHover={setHoveredRw}
          />
        </div>
        <RwAreaLegend areas={areas} hasPoints={hasPoints} />
        <RwAreaCredit hasEstimates={markers.some((marker) => marker.isEstimate)} />
      </figure>
      <RwAreaList
        areas={areas}
        selection={selection}
        onToggle={toggleFromList}
        onHover={setHoveredRw}
      />
    </div>
  );
}
