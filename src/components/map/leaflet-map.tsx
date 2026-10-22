'use client';

import 'leaflet/dist/leaflet.css';

import type { LatLngTuple, Map as LeafletMapInstance } from 'leaflet';
import { ExternalLink, Minus, Plus } from 'lucide-react';
import { useReducedMotion } from 'motion/react';
import { useState } from 'react';
import { CircleMarker, MapContainer, Popup, TileLayer, Tooltip } from 'react-leaflet';

import { Button } from '@/components/ui/button';
import {
  GEO_FIT_MAX_ZOOM,
  GEO_FIT_PADDING_PX,
  GEO_MAX_ZOOM,
  GEO_POINT_MARKER_RADIUS,
  GEO_RW_MARKER_RADIUS,
  GEO_SINGLE_MARKER_ZOOM,
  OSM_COPYRIGHT_URL,
  OSM_TILE_URL,
} from '@/config/map';
import { rwAccentClasses } from '@/config/rw';
import { mapCopy } from '@/lib/copy/map';
import { cn } from '@/lib/utils/cn';
import type { GeoMarker } from '@/types/map';

export interface LeafletMapProps {
  // At least one, or the page leaves the map out (docs/StyleGuide.md §6.9).
  markers: readonly GeoMarker[];
}

const FIT_PADDING: [number, number] = [GEO_FIT_PADDING_PX, GEO_FIT_PADDING_PX];
const FIT_OPTIONS = { padding: FIT_PADDING, maxZoom: GEO_FIT_MAX_ZOOM };

// The markers are vectors in the RW's palette (.denah-marker, .denah-rw-* in src/styles/globals.css) rather than
// Leaflet's PNG pins, which bundlers lose and which carry no RW colour.
function MarkerPin({ marker }: { marker: GeoMarker }) {
  return (
    <CircleMarker
      center={[marker.lat, marker.lng]}
      radius={marker.kind === 'rw' ? GEO_RW_MARKER_RADIUS : GEO_POINT_MARKER_RADIUS}
      pathOptions={{ className: cn('denah-marker', rwAccentClasses(marker.rw.accentKey).plan) }}
    >
      {marker.kind === 'rw' ? (
        <Tooltip permanent direction="top">
          {marker.rw.label}
        </Tooltip>
      ) : null}
      <Popup>
        <div className="space-y-1 font-sans">
          <p className="text-overline text-muted-foreground">
            {marker.detail ? `${marker.rw.label} · ${marker.detail}` : marker.rw.label}
          </p>
          <p className="text-body-sm font-semibold">{marker.name}</p>
          <a
            href={marker.routeUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-11 items-center gap-1 text-body-sm text-primary-text underline-offset-4 hover:underline"
          >
            <ExternalLink aria-hidden className="size-4" />
            {mapCopy.route}
          </a>
        </div>
      </Popup>
    </CircleMarker>
  );
}

// Leaflet's own zoom buttons are 30 px; these are the 44 px of docs/StyleGuide.md §9.1 A4, and they sit outside
// the map element, above its stacking context.
function GeoZoomControls({ map }: { map: LeafletMapInstance | null }) {
  return (
    <div className="absolute top-3 right-3 z-10 flex flex-col gap-2">
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="size-11 bg-background"
        aria-label={mapCopy.geoZoomIn}
        disabled={map === null}
        onClick={() => map?.zoomIn()}
      >
        <Plus aria-hidden />
      </Button>
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="size-11 bg-background"
        aria-label={mapCopy.geoZoomOut}
        disabled={map === null}
        onClick={() => map?.zoomOut()}
      >
        <Minus aria-hidden />
      </Button>
    </div>
  );
}

function viewFor(markers: readonly GeoMarker[]) {
  const [only] = markers;
  if (markers.length === 1 && only !== undefined) {
    return { center: [only.lat, only.lng] as LatLngTuple, zoom: GEO_SINGLE_MARKER_ZOOM };
  }
  return { bounds: markers.map((marker): LatLngTuple => [marker.lat, marker.lng]) };
}

// The credit under the map is a condition of the OSM tile usage policy.
function OsmCredit() {
  return (
    <figcaption className="text-caption text-muted-foreground">
      {mapCopy.osmCredit} ©{' '}
      <a
        href={OSM_COPYRIGHT_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="underline underline-offset-4 hover:text-foreground"
      >
        {mapCopy.osmContributors}
      </a>
    </figcaption>
  );
}

// docs/StyleGuide.md §5.13, docs/PRD.md FR-PUB-18: OpenStreetMap tiles under the RW centres and the activity
// points.
export function LeafletMap({ markers }: LeafletMapProps) {
  const [map, setMap] = useState<LeafletMapInstance | null>(null);
  const prefersReducedMotion = useReducedMotion() === true;
  return (
    <figure className="space-y-2">
      <div
        role="group"
        aria-label={mapCopy.geoLabel}
        className="relative isolate overflow-hidden rounded-xl border border-border"
      >
        <MapContainer
          ref={setMap}
          {...viewFor(markers)}
          boundsOptions={FIT_OPTIONS}
          maxZoom={GEO_MAX_ZOOM}
          zoomControl={false}
          attributionControl={false}
          scrollWheelZoom={false}
          zoomAnimation={!prefersReducedMotion}
          fadeAnimation={!prefersReducedMotion}
          className="aspect-video w-full bg-muted"
        >
          <TileLayer url={OSM_TILE_URL} maxZoom={GEO_MAX_ZOOM} />
          {markers.map((marker) => (
            <MarkerPin key={marker.id} marker={marker} />
          ))}
        </MapContainer>
        <GeoZoomControls map={map} />
      </div>
      <OsmCredit />
    </figure>
  );
}
