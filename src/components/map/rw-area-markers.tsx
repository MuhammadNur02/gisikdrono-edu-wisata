'use client';

import { ExternalLink } from 'lucide-react';
import { useMemo } from 'react';
import { CircleMarker, Popup, Tooltip } from 'react-leaflet';

import { Badge } from '@/components/ui/badge';
import { GEO_POINT_MARKER_RADIUS, RW_AREA_CLASS, RW_AREA_OFFICE_MARKER_RADIUS } from '@/config/map';
import { rwAccentClasses } from '@/config/rw';
import { RW_AREA_MAP } from '@/config/rw-areas';
import { mapCopy } from '@/lib/copy/map';
import { cn } from '@/lib/utils/cn';
import type { GeoMarker } from '@/types/map';

// The office and the activity points on the RW area map (src/components/map/rw-area-leaflet.tsx). They sit in the
// marker pane, above every RW shape, even one brought to the front.
const MARKER_PANE = 'markerPane';
const OFFICE_PATH = { className: RW_AREA_CLASS.office };
// GeoJSON writes [lng, lat]; Leaflet takes [lat, lng].
const OFFICE_LATLNG: [number, number] = [
  RW_AREA_MAP.office.position[1],
  RW_AREA_MAP.office.position[0],
];

interface PlacePopupProps {
  eyebrow: string;
  name: string;
  routeUrl: string;
  isEstimate: boolean;
}

function PlacePopup({ eyebrow, name, routeUrl, isEstimate }: PlacePopupProps) {
  return (
    <div className="space-y-1 font-sans">
      <p className="text-overline text-muted-foreground">{eyebrow}</p>
      <p className="flex flex-wrap items-center gap-2 text-body-sm font-semibold">
        {name}
        {isEstimate ? <Badge variant="neutral">{mapCopy.estimateBadge}</Badge> : null}
      </p>
      <a
        href={routeUrl}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={mapCopy.routeTo(name)}
        className="inline-flex min-h-11 items-center gap-1 text-body-sm text-primary-text underline-offset-4 hover:underline"
      >
        <ExternalLink aria-hidden className="size-4" />
        {mapCopy.route}
      </a>
    </div>
  );
}

// The markers are vectors in the RW's palette (.denah-marker, .denah-rw-* in src/styles/globals.css) rather than
// Leaflet's PNG pins, which bundlers lose and which carry no RW colour.
export function PointMarker({ marker }: { marker: GeoMarker }) {
  const pathOptions = useMemo(
    () => ({ className: cn('denah-marker', rwAccentClasses(marker.rw.accentKey).plan) }),
    [marker.rw.accentKey],
  );
  return (
    <CircleMarker
      center={[marker.lat, marker.lng]}
      radius={GEO_POINT_MARKER_RADIUS}
      pane={MARKER_PANE}
      pathOptions={pathOptions}
    >
      <Tooltip direction="top">{marker.name}</Tooltip>
      <Popup>
        <PlacePopup
          eyebrow={marker.detail ? `${marker.rw.label} · ${marker.detail}` : marker.rw.label}
          name={marker.name}
          routeUrl={marker.routeUrl}
          isEstimate={marker.isEstimate}
        />
      </Popup>
    </CircleMarker>
  );
}

export function OfficeMarker({ routeUrl }: { routeUrl: string }) {
  return (
    <CircleMarker
      center={OFFICE_LATLNG}
      radius={RW_AREA_OFFICE_MARKER_RADIUS}
      pane={MARKER_PANE}
      pathOptions={OFFICE_PATH}
    >
      <Tooltip direction="top">{RW_AREA_MAP.office.name}</Tooltip>
      <Popup>
        <PlacePopup
          eyebrow={mapCopy.legendOffice}
          name={RW_AREA_MAP.office.name}
          routeUrl={routeUrl}
          isEstimate={false}
        />
      </Popup>
    </CircleMarker>
  );
}
