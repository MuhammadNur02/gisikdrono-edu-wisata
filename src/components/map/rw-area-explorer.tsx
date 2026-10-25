'use client';

import { LayoutGrid, Map as MapIcon } from 'lucide-react';
import dynamic from 'next/dynamic';
import { useCallback, useRef, useState, type ReactNode } from 'react';

import { Container } from '@/components/layout/container';
import { PointCard } from '@/components/map/point-card';
import { RwAreaList } from '@/components/map/rw-area-list';
import { Skeleton } from '@/components/ui/skeleton';
import { HOTSPOT_ID_ATTRIBUTE, OSM_COPYRIGHT_URL, RW_AREA_FRAME_CLASS } from '@/config/map';
import { rwAccentClasses, type RwId } from '@/config/rw';
import { mapCopy } from '@/lib/copy/map';
import { cn } from '@/lib/utils/cn';
import type { GeoMarker, PointSelection, RwAreaSelection, RwAreaSummary } from '@/types/map';

// docs/StyleGuide.md §10.1: Leaflet and the RW shapes reach the browser only after the page itself, behind a
// skeleton of the map's frame, so neither counts against the public first-load budget (next/dynamic with ssr: false
// must sit in a client file). The list, the legend and the credit render on the server.
const RwAreaLeaflet = dynamic(
  () => import('@/components/map/rw-area-leaflet').then((module) => module.RwAreaLeaflet),
  { ssr: false, loading: () => <Skeleton className={cn('rounded-none', RW_AREA_FRAME_CLASS)} /> },
);

type MapView = 'areas' | 'plan';

const MAP_FRAME_ID = 'peta-wilayah';

export interface RwAreaExplorerProps {
  // Every RW of the kelurahan's map, in number order (buildRwAreaSummaries).
  areas: readonly RwAreaSummary[];
  // The activity points with coordinates.
  markers: readonly GeoMarker[];
  // The page's heading block, beside the view switch.
  heading: ReactNode;
  // The site plan (`Denah aktivitas`), mounted only once the visitor switches to it.
  plan: ReactNode;
  // What sits between the map and the list of points: the contact blocks.
  between: ReactNode;
  // The heading of the list of points.
  listHeading: ReactNode;
}

const VIEWS = [
  { value: 'areas', label: mapCopy.viewAreas, icon: MapIcon },
  { value: 'plan', label: mapCopy.viewPlan, icon: LayoutGrid },
] as const;

// DESIGN-SPEC §3.9 segmented control: the white thumb marks the view on the sunken track.
function ViewSwitch({ view, onChange }: { view: MapView; onChange: (view: MapView) => void }) {
  return (
    <div
      role="group"
      aria-label={mapCopy.viewLabel}
      className="flex shrink-0 rounded-lg bg-muted p-1 max-md:w-full"
    >
      {VIEWS.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={view === option.value}
          onClick={() => {
            onChange(option.value);
          }}
          className={cn(
            'flex h-11 items-center justify-center gap-2 rounded-md px-4 text-label-sm font-semibold transition-[background-color,color,box-shadow] duration-300 max-md:flex-1',
            view === option.value
              ? 'bg-card text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          <option.icon aria-hidden className="size-4.5" />
          {option.label}
        </button>
      ))}
    </div>
  );
}

// The RWs with points, in the legend at the map's bottom left: `RW 05 · 6 titik`.
function MapLegend({ areas }: { areas: readonly RwAreaSummary[] }) {
  const edu = areas.flatMap((area) =>
    area.unit && area.points.length > 0 ? [{ ...area, unit: area.unit }] : [],
  );
  if (edu.length === 0) return null;
  return (
    <ul
      aria-label={mapCopy.legendLabel}
      className="absolute bottom-4 left-4 z-10 flex flex-wrap gap-x-4 gap-y-1 rounded-md bg-card/95 px-3.5 py-2 text-caption text-foreground shadow-sm max-md:hidden"
    >
      {edu.map((area) => (
        <li key={area.rw} className="flex items-center gap-2">
          <span
            aria-hidden
            className={cn('size-2.5 rounded-full', rwAccentClasses(area.unit.accentKey).fill)}
          />
          {mapCopy.legendPoints(area.label, area.points.length)}
        </li>
      ))}
    </ul>
  );
}

function OsmCredit() {
  return (
    <p className="absolute top-3 left-3 z-10 rounded-sm bg-card/90 px-2 py-0.5 text-xs text-ink-2 md:top-auto md:right-3 md:bottom-3 md:left-auto">
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
  );
}

function useAreaSelection() {
  const [selection, setSelection] = useState<RwAreaSelection | null>(null);
  const [hoveredRw, setHoveredRw] = useState<RwId | null>(null);
  const selectArea = useCallback((rw: RwId) => {
    setSelection({ rw, source: 'map' });
  }, []);
  const toggleArea = useCallback((rw: RwId) => {
    setSelection((current) => (current?.rw === rw ? null : { rw, source: 'list' }));
  }, []);
  return { selection, hoveredRw, setHoveredRw, selectArea, toggleArea };
}

// A point picked in the list switches back to the map, scrolls it into view and flies to the point.
// The hotspot of a point, by the id its button carries.
function hotspotOf(id: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(`[${HOTSPOT_ID_ATTRIBUTE}="${CSS.escape(id)}"]`);
}

function usePointSelection(setView: (view: MapView) => void) {
  const [pointSelection, setPointSelection] = useState<PointSelection | null>(null);
  const openId = useRef<string | null>(null);
  openId.current = pointSelection?.id ?? null;
  const selectPoint = useCallback((id: string) => {
    setPointSelection({ id, source: 'map' });
  }, []);
  const locatePoint = useCallback(
    (id: string) => {
      setView('areas');
      setPointSelection({ id, source: 'list' });
      document.getElementById(MAP_FRAME_ID)?.scrollIntoView({ block: 'center' });
    },
    [setView],
  );
  // The focus goes back to the point's hotspot once its card has gone (Esc or the close button).
  const closePoint = useCallback(() => {
    const id = openId.current;
    setPointSelection(null);
    if (id !== null) {
      requestAnimationFrame(() => {
        hotspotOf(id)?.focus();
      });
    }
  }, []);
  return { pointSelection, selectPoint, locatePoint, closePoint };
}

type AreaState = ReturnType<typeof useAreaSelection>;
type PointState = ReturnType<typeof usePointSelection>;

interface AreaMapProps {
  areas: readonly RwAreaSummary[];
  markers: readonly GeoMarker[];
  area: AreaState;
  point: PointState;
}

function AreaMap({ areas, markers, area, point }: AreaMapProps) {
  const selectedMarker = markers.find((marker) => marker.id === point.pointSelection?.id) ?? null;
  return (
    <div
      id={MAP_FRAME_ID}
      role="group"
      aria-label={mapCopy.areaLabel}
      className="relative isolate overflow-hidden border-y border-border max-md:-mx-5 md:rounded-2xl md:border"
    >
      <RwAreaLeaflet
        areas={areas}
        markers={markers}
        selection={area.selection}
        hoveredRw={area.hoveredRw}
        onSelect={area.selectArea}
        onHover={area.setHoveredRw}
        pointSelection={point.pointSelection}
        onSelectPoint={point.selectPoint}
      />
      <MapLegend areas={areas} />
      <OsmCredit />
      {selectedMarker ? (
        <PointCard key={selectedMarker.id} marker={selectedMarker} onClose={point.closePoint} />
      ) : null}
    </div>
  );
}

interface PointsListProps {
  heading: ReactNode;
  areas: readonly RwAreaSummary[];
  area: AreaState;
  point: PointState;
}

// DESIGN-SPEC §3.9 `Daftar titik` on the sunken paper.
function PointsList({ heading, areas, area, point }: PointsListProps) {
  return (
    <div className="bg-muted py-14 md:py-20 lg:py-28">
      <Container className="space-y-10 md:space-y-12">
        {heading}
        <RwAreaList
          areas={areas}
          selection={area.selection}
          onToggle={area.toggleArea}
          onHover={area.setHoveredRw}
          onLocate={point.locatePoint}
        />
      </Container>
    </div>
  );
}

// docs/PRD.md FR-PUB-18 in the layout of DESIGN-SPEC §3.9: the heading and the view switch, the RW area map with its
// hotspots and point card (or the site plan), the contact blocks, then every RW and point as the map's readable and
// keyboard alternative.
export function RwAreaExplorer(props: RwAreaExplorerProps) {
  const [view, setView] = useState<MapView>('areas');
  const area = useAreaSelection();
  const point = usePointSelection(setView);
  return (
    <>
      <Container className="space-y-8 pt-10 pb-14 md:space-y-10 md:pt-16 md:pb-20">
        <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          {props.heading}
          <ViewSwitch view={view} onChange={setView} />
        </div>
        <figure className="space-y-3">
          {view === 'areas' ? (
            <AreaMap areas={props.areas} markers={props.markers} area={area} point={point} />
          ) : (
            props.plan
          )}
          <figcaption className="space-y-1 text-caption text-muted-foreground">
            <p>{mapCopy.areaSource}</p>
            {props.markers.some((marker) => marker.isEstimate) ? (
              <p>{mapCopy.pointsEstimated}</p>
            ) : null}
          </figcaption>
        </figure>
      </Container>
      {props.between}
      <PointsList heading={props.listHeading} areas={props.areas} area={area} point={point} />
    </>
  );
}
