'use client';

import 'leaflet/dist/leaflet.css';

import {
  divIcon,
  latLngBounds,
  type LatLngTuple,
  type LeafletEventHandlerFnMap,
  type Map as LeafletMapInstance,
  type Polygon as LeafletPolygon,
} from 'leaflet';
import { Minus, Plus, RotateCcw, type LucideIcon } from 'lucide-react';
import { useReducedMotion } from 'motion/react';
import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { MapContainer, Marker, Polygon, TileLayer, Tooltip } from 'react-leaflet';

import { OfficeMarker, PointMarker } from '@/components/map/rw-area-markers';
import { Button } from '@/components/ui/button';
import {
  GEO_MAX_ZOOM,
  OSM_TILE_URL,
  RW_AREA_CLASS,
  RW_AREA_FIT_PADDING_PX,
  RW_AREA_FLY_SECONDS,
  RW_AREA_FRAME_CLASS,
  RW_AREA_SELECT_MAX_ZOOM,
  RW_AREA_ZOOM_SNAP,
} from '@/config/map';
import { rwAccentClasses, rwNumber, type RwId } from '@/config/rw';
import { RW_AREA_MAP } from '@/config/rw-areas';
import { mapCopy } from '@/lib/copy/map';
import { cn } from '@/lib/utils/cn';
import type { PolygonRings, Position } from '@/lib/utils/geo-polygon';
import type { GeoMarker, RwAreaSelection, RwAreaSummary } from '@/types/map';

// GeoJSON writes [lng, lat]; Leaflet takes [lat, lng].
function toLatLng([lng, lat]: Position): LatLngTuple {
  return [lat, lng];
}

function toLatLngs(polygon: PolygonRings): LatLngTuple[][] {
  return polygon.map((ring) => ring.map(toLatLng));
}

const BOUNDARY_LATLNGS = toLatLngs(RW_AREA_MAP.boundary);
const KELURAHAN_BOUNDS = latLngBounds(BOUNDARY_LATLNGS.flat());
const AREA_LATLNGS = new Map(
  RW_AREA_MAP.areas.map((area) => [area.rw, area.polygons.map(toLatLngs)]),
);
const FIT_PADDING: [number, number] = [RW_AREA_FIT_PADDING_PX, RW_AREA_FIT_PADDING_PX];
const FIT_OPTIONS = { padding: FIT_PADDING };
// An RW's positions are nested polygon > ring > position; its bounds need the positions alone.
const RING_DEPTH = 2;
// The boundary is an outline only and never takes a click from the RW under it.
const BOUNDARY_PATH = { className: RW_AREA_CLASS.boundary, fill: false, interactive: false };
// Leaflet's own markers need a size; the label centres itself on the point in CSS (src/styles/globals.css).
const LABEL_ICON_SIZE: [number, number] = [0, 0];

export interface RwAreaLeafletProps {
  areas: readonly RwAreaSummary[];
  // The activity points with coordinates.
  markers: readonly GeoMarker[];
  officeRouteUrl: string;
  selection: RwAreaSelection | null;
  hoveredRw: RwId | null;
  onSelect: (rw: RwId) => void;
  onHover: (rw: RwId | null) => void;
}

type AreaShapeProps = Pick<RwAreaLeafletProps, 'onSelect' | 'onHover'> & {
  area: RwAreaSummary;
  isSelected: boolean;
  isHovered: boolean;
};

// Leaflet sets a path's class only when it draws it, so the hover and selected states are toggled on the element.
function useAreaState(
  ref: RefObject<LeafletPolygon | null>,
  isSelected: boolean,
  isHovered: boolean,
) {
  useEffect(() => {
    const element = ref.current?.getElement();
    element?.classList.toggle(RW_AREA_CLASS.hover, isHovered);
    element?.classList.toggle(RW_AREA_CLASS.selected, isSelected);
    if (isSelected || isHovered) ref.current?.bringToFront();
  }, [ref, isSelected, isHovered]);
}

function AreaShape({ area, isSelected, isHovered, onSelect, onHover }: AreaShapeProps) {
  const ref = useRef<LeafletPolygon>(null);
  useAreaState(ref, isSelected, isHovered);
  const pathOptions = useMemo(
    () => ({
      className: cn(
        RW_AREA_CLASS.area,
        rwAccentClasses(area.unit?.accentKey ?? null).plan,
        area.unit && RW_AREA_CLASS.edu,
      ),
    }),
    [area.unit],
  );
  const eventHandlers = useMemo<LeafletEventHandlerFnMap>(
    () => ({
      click: () => {
        onSelect(area.rw);
      },
      mouseover: () => {
        onHover(area.rw);
      },
      mouseout: () => {
        onHover(null);
      },
    }),
    [area.rw, onSelect, onHover],
  );
  const positions = AREA_LATLNGS.get(area.rw);
  if (positions === undefined) return null;
  return (
    <Polygon
      ref={ref}
      positions={positions}
      pathOptions={pathOptions}
      eventHandlers={eventHandlers}
    >
      <Tooltip sticky>{area.unit ? `${area.label} · ${area.unit.shortName}` : area.label}</Tooltip>
    </Polygon>
  );
}

// The RW's number inside its area, in the RW palette for an edu-tourism RW. Not interactive: a click passes to the
// shape under it. The html is two digits from rwNumber, never text from the database.
function AreaLabel({ area }: { area: RwAreaSummary }) {
  const icon = useMemo(
    () =>
      divIcon({
        className: cn(
          RW_AREA_CLASS.label,
          rwAccentClasses(area.unit?.accentKey ?? null).plan,
          area.unit && RW_AREA_CLASS.labelEdu,
        ),
        html: `<span>${rwNumber(area.rw)}</span>`,
        iconSize: LABEL_ICON_SIZE,
      }),
    [area.rw, area.unit],
  );
  return (
    <Marker
      position={[area.centre.lat, area.centre.lng]}
      icon={icon}
      interactive={false}
      keyboard={false}
    />
  );
}

// An RW chosen in the list is brought into view; one clicked on the map is already in view. A visitor who asked
// for less motion gets the new view at once instead of a flight (docs/StyleGuide.md §7.4).
function useFrameSelection(
  map: LeafletMapInstance | null,
  selection: RwAreaSelection | null,
  prefersReducedMotion: boolean,
) {
  useEffect(() => {
    if (map === null || selection?.source !== 'list') return;
    const positions = AREA_LATLNGS.get(selection.rw);
    if (positions === undefined) return;
    const bounds = latLngBounds(positions.flat(RING_DEPTH));
    const options = { padding: FIT_PADDING, maxZoom: RW_AREA_SELECT_MAX_ZOOM };
    if (prefersReducedMotion) map.fitBounds(bounds, { ...options, animate: false });
    else map.flyToBounds(bounds, { ...options, duration: RW_AREA_FLY_SECONDS });
  }, [map, selection, prefersReducedMotion]);
}

function ControlButton({
  label,
  icon,
  onPress,
}: {
  label: string;
  icon: LucideIcon;
  onPress: () => void;
}) {
  const Icon = icon;
  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      className="size-11 bg-background"
      aria-label={label}
      onClick={onPress}
    >
      <Icon aria-hidden />
    </Button>
  );
}

// 44 px buttons (docs/StyleGuide.md §9.1 A4) beside the map element, whose `isolate` keeps Leaflet's panes from
// covering them; the third shows the whole kelurahan again.
function MapControls({
  map,
  prefersReducedMotion,
}: {
  map: LeafletMapInstance;
  prefersReducedMotion: boolean;
}) {
  return (
    <div className="absolute top-3 right-3 z-10 flex flex-col gap-2">
      <ControlButton label={mapCopy.geoZoomIn} icon={Plus} onPress={() => map.zoomIn()} />
      <ControlButton label={mapCopy.geoZoomOut} icon={Minus} onPress={() => map.zoomOut()} />
      <ControlButton
        label={mapCopy.geoReset}
        icon={RotateCcw}
        onPress={() =>
          map.fitBounds(KELURAHAN_BOUNDS, { ...FIT_OPTIONS, animate: !prefersReducedMotion })
        }
      />
    </div>
  );
}

type AreaLayersProps = Pick<
  RwAreaLeafletProps,
  'areas' | 'selection' | 'hoveredRw' | 'onSelect' | 'onHover'
>;

// The RW shapes, the boundary over them and the RW numbers on top.
function AreaLayers({ areas, selection, hoveredRw, onSelect, onHover }: AreaLayersProps) {
  return (
    <>
      {areas.map((area) => (
        <AreaShape
          key={area.rw}
          area={area}
          isSelected={selection?.rw === area.rw}
          isHovered={hoveredRw === area.rw}
          onSelect={onSelect}
          onHover={onHover}
        />
      ))}
      <Polygon positions={BOUNDARY_LATLNGS} pathOptions={BOUNDARY_PATH} />
      {areas.map((area) => (
        <AreaLabel key={area.rw} area={area} />
      ))}
    </>
  );
}

// docs/PRD.md FR-PUB-18: the kelurahan's 13 RW areas over OpenStreetMap tiles, the edu-tourism RWs in their accent
// and the others in the neutral fill, with the boundary as an outline, the office and the activity points. The view
// fits the boundary. Leaflet's shapes take no keyboard focus, so the list beside the map (RwAreaList) is the
// keyboard and screen-reader path to the same content.
export function RwAreaLeaflet({ markers, officeRouteUrl, ...layers }: RwAreaLeafletProps) {
  const [map, setMap] = useState<LeafletMapInstance | null>(null);
  const prefersReducedMotion = useReducedMotion() === true;
  useFrameSelection(map, layers.selection, prefersReducedMotion);
  return (
    <>
      <MapContainer
        ref={setMap}
        bounds={KELURAHAN_BOUNDS}
        boundsOptions={FIT_OPTIONS}
        maxZoom={GEO_MAX_ZOOM}
        zoomSnap={RW_AREA_ZOOM_SNAP}
        zoomControl={false}
        attributionControl={false}
        scrollWheelZoom={false}
        zoomAnimation={!prefersReducedMotion}
        fadeAnimation={!prefersReducedMotion}
        markerZoomAnimation={!prefersReducedMotion}
        className={cn('isolate bg-muted', RW_AREA_FRAME_CLASS)}
      >
        <TileLayer url={OSM_TILE_URL} maxZoom={GEO_MAX_ZOOM} />
        <AreaLayers {...layers} />
        <OfficeMarker routeUrl={officeRouteUrl} />
        {markers.map((marker) => (
          <PointMarker key={marker.id} marker={marker} />
        ))}
      </MapContainer>
      {map ? <MapControls map={map} prefersReducedMotion={prefersReducedMotion} /> : null}
    </>
  );
}
