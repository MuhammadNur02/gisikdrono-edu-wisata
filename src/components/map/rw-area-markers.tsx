'use client';

import { divIcon, type LeafletEventHandlerFnMap, type Marker as LeafletMarker } from 'leaflet';
import { useEffect, useMemo, useRef, type RefObject } from 'react';
import { CircleMarker, Marker, Tooltip } from 'react-leaflet';

import { HOTSPOT_ID_ATTRIBUTE, RW_AREA_CLASS, RW_AREA_OFFICE_MARKER_RADIUS } from '@/config/map';
import { rwAccentClasses } from '@/config/rw';
import { RW_AREA_MAP } from '@/config/rw-areas';
import { mapCopy } from '@/lib/copy/map';
import { escapeHtml } from '@/lib/utils/html';
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
// Leaflet's markers need a size; the hotspot centres itself on the point (its translate classes).
const ICON_SIZE: [number, number] = [0, 0];
// A selected hotspot draws over its neighbours.
const SELECTED_Z_OFFSET = 1000;
// lucide MapPin at 14 px: static markup, no data in it.
const PIN_SVG =
  '<svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"/><circle cx="12" cy="10" r="3"/></svg>';

const HOTSPOT_CLASS =
  'pin-drop pointer-events-auto flex cursor-pointer items-center justify-center rounded-full bg-rw-fill text-white shadow-md transition-[width,height,scale] duration-200 ease-spring-snappy hover:scale-112 focus-visible:scale-112';

// The hotspot's size at rest and while its card is open; toggled on the live button, never by rebuilding the icon.
const REST_CLASSES = ['size-7.5', 'ring-2'];
const SELECTED_CLASSES = ['size-10', 'ring-3'];

// DESIGN-SPEC §3.9 hotspot: a 30 px circle in the RW's accent with a 2 px white ring and the pin, 40 px with a 3 px
// ring while its card is open. It is a real <button> named after the point and its RW, so the map's points are
// reachable by keyboard; the outer span centres it, the button itself drops in (--i staggers the drops by 40 ms).
// The name and the id go through escapeHtml: Leaflet sets this string as markup.
function hotspotMarkup(marker: GeoMarker, index: number): string {
  const label = escapeHtml(mapCopy.hotspot(marker.name, marker.rw.label));
  const scope = rwAccentClasses(marker.rw.accentKey).scope;
  return `<span class="absolute -translate-x-1/2 -translate-y-1/2"><button type="button" ${HOTSPOT_ID_ATTRIBUTE}="${escapeHtml(marker.id)}" aria-label="${label}" aria-pressed="false" style="--i:${String(index)};--pin-stagger:40ms" class="${HOTSPOT_CLASS} ${scope} ${REST_CLASSES.join(' ')} ring-white">${PIN_SVG}</button></span>`;
}

// Marks the open hotspot on the element Leaflet already drew, so its focus and its drop animation survive.
function useSelectedState(ref: RefObject<LeafletMarker | null>, isSelected: boolean) {
  useEffect(() => {
    const button = ref.current?.getElement()?.querySelector('button');
    if (!button) return;
    button.setAttribute('aria-pressed', String(isSelected));
    button.classList.remove(...(isSelected ? REST_CLASSES : SELECTED_CLASSES));
    button.classList.add(...(isSelected ? SELECTED_CLASSES : REST_CLASSES));
  }, [ref, isSelected]);
}

export interface PointMarkerProps {
  marker: GeoMarker;
  index: number;
  isSelected: boolean;
  onSelect: (id: string) => void;
}

// A click on the button (or Enter and Space, which a button turns into a click) bubbles to Leaflet's marker, which
// opens the point's card. The marker itself takes no focus: the button inside it does.
export function PointMarker({ marker, index, isSelected, onSelect }: PointMarkerProps) {
  const ref = useRef<LeafletMarker>(null);
  const icon = useMemo(
    () => divIcon({ className: '', html: hotspotMarkup(marker, index), iconSize: ICON_SIZE }),
    [marker, index],
  );
  useSelectedState(ref, isSelected);
  const eventHandlers = useMemo<LeafletEventHandlerFnMap>(
    () => ({
      click: () => {
        onSelect(marker.id);
      },
    }),
    [marker.id, onSelect],
  );
  return (
    <Marker
      ref={ref}
      position={[marker.lat, marker.lng]}
      icon={icon}
      keyboard={false}
      zIndexOffset={isSelected ? SELECTED_Z_OFFSET : 0}
      eventHandlers={eventHandlers}
    />
  );
}

// The kelurahan office, named on hover; its address and route are in the contact block under the map.
export function OfficeMarker() {
  return (
    <CircleMarker
      center={OFFICE_LATLNG}
      radius={RW_AREA_OFFICE_MARKER_RADIUS}
      pane={MARKER_PANE}
      pathOptions={OFFICE_PATH}
    >
      <Tooltip direction="top">{RW_AREA_MAP.office.name}</Tooltip>
    </CircleMarker>
  );
}
