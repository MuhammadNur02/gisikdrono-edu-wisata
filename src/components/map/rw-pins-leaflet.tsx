'use client';

import 'leaflet/dist/leaflet.css';

import { divIcon, latLngBounds, type LatLngTuple, type Map as LeafletMapInstance } from 'leaflet';
import { Minus, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { MapContainer, Marker, TileLayer } from 'react-leaflet';

import {
  GEO_MAX_ZOOM,
  OSM_TILE_URL,
  RW_AREA_FIT_PADDING_PX,
  RW_AREA_ZOOM_SNAP,
} from '@/config/map';
import { rwAccentClasses } from '@/config/rw';
import { RW_AREA_MAP } from '@/config/rw-areas';
import { mapCopy } from '@/lib/copy/map';
import type { Position } from '@/lib/utils/geo-polygon';
import { escapeHtml } from '@/lib/utils/html';
import type { RwPin } from '@/types/map';

// GeoJSON writes [lng, lat]; Leaflet takes [lat, lng].
function toLatLng([lng, lat]: Position): LatLngTuple {
  return [lat, lng];
}

const KELURAHAN_BOUNDS = latLngBounds(RW_AREA_MAP.boundary.flat().map(toLatLng));
const FIT_PADDING: [number, number] = [RW_AREA_FIT_PADDING_PX, RW_AREA_FIT_PADDING_PX];
// Leaflet's markers need a size; the pill places itself on the point (translate in its classes).
const ICON_SIZE: [number, number] = [0, 0];
// lucide MapPin, 14 px, white: static markup, no data in it.
const PIN_SVG =
  '<svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"/><circle cx="12" cy="10" r="3"/></svg>';

// The pill of DESIGN-SPEC §3.1 (home map): the RW's accent circle with the pin, then its name (the number alone on a
// phone). It is a link to the RW page; every text in it comes from rw_units through escapeHtml. The outer span centres
// it on the point and the link itself drops in: both use the CSS translate property, so they cannot share an element.
function pinMarkup(pin: RwPin, index: number): string {
  const scope = rwAccentClasses(pin.accentKey).scope;
  return `<span class="absolute -translate-x-1/2 -translate-y-1/2"><a href="${escapeHtml(pin.path)}" style="--i:${String(index)}" class="pin-drop ${scope} pointer-events-auto flex items-center gap-2 whitespace-nowrap rounded-full bg-card py-1 pr-3.5 pl-1 font-sans text-label-sm font-semibold text-foreground! no-underline shadow-md md:pr-4"><span class="flex size-7 items-center justify-center rounded-full bg-rw-fill text-white">${PIN_SVG}</span><span class="md:hidden">${escapeHtml(pin.label)}</span><span class="max-md:hidden">${escapeHtml(pin.name)}</span></a></span>`;
}

function PinMarker({ pin, index }: { pin: RwPin; index: number }) {
  const icon = useMemo(
    () => divIcon({ className: '', html: pinMarkup(pin, index), iconSize: ICON_SIZE }),
    [pin, index],
  );
  return <Marker position={[pin.lat, pin.lng]} icon={icon} keyboard={false} interactive={false} />;
}

function ZoomControls({ map }: { map: LeafletMapInstance }) {
  const buttons = [
    { label: mapCopy.geoZoomIn, icon: Plus, onPress: () => map.zoomIn() },
    { label: mapCopy.geoZoomOut, icon: Minus, onPress: () => map.zoomOut() },
  ];
  return (
    <div className="absolute top-4 right-4 z-10 flex flex-col divide-y divide-border overflow-hidden rounded-md bg-card shadow-sm">
      {buttons.map(({ label, icon, onPress }) => {
        const Icon = icon;
        return (
          <button
            key={label}
            type="button"
            aria-label={label}
            onClick={onPress}
            className="flex size-11 items-center justify-center text-foreground transition-colors hover:bg-muted"
          >
            <Icon aria-hidden className="size-4.5" />
          </button>
        );
      })}
    </div>
  );
}

export interface RwPinsLeafletProps {
  pins: readonly RwPin[];
}

// The home page's map (DESIGN-SPEC §3.1 `Peta & kontak`): OpenStreetMap tiles framed on the kelurahan, one pill per
// RW at the centre rw_units gives it, dropping in one after another on the pin spring. /peta-kontak has the full map.
export function RwPinsLeaflet({ pins }: RwPinsLeafletProps) {
  const [map, setMap] = useState<LeafletMapInstance | null>(null);
  return (
    <>
      <MapContainer
        ref={setMap}
        bounds={KELURAHAN_BOUNDS}
        boundsOptions={{ padding: FIT_PADDING }}
        maxZoom={GEO_MAX_ZOOM}
        zoomSnap={RW_AREA_ZOOM_SNAP}
        zoomControl={false}
        attributionControl={false}
        scrollWheelZoom={false}
        className="isolate size-full bg-muted"
      >
        <TileLayer url={OSM_TILE_URL} maxZoom={GEO_MAX_ZOOM} />
        {pins.map((pin, index) => (
          <PinMarker key={pin.path} pin={pin} index={index} />
        ))}
      </MapContainer>
      {map ? <ZoomControls map={map} /> : null}
    </>
  );
}
