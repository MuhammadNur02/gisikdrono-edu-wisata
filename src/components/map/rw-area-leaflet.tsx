'use client';

import 'leaflet/dist/leaflet.css';

import {
  divIcon,
  latLngBounds,
  type LatLngBounds,
  type LatLngTuple,
  type LeafletEventHandlerFnMap,
  type Map as LeafletMapInstance,
  type Polygon as LeafletPolygon,
} from 'leaflet';
import { useReducedMotion } from 'motion/react';
import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { MapContainer, Marker, Polygon, TileLayer, Tooltip } from 'react-leaflet';

import { MapControls } from '@/components/map/rw-area-controls';
import { OfficeMarker, PointMarker } from '@/components/map/rw-area-markers';
import {
  GEO_MAX_ZOOM,
  OSM_TILE_URL,
  RW_AREA_CLASS,
  RW_AREA_FIT_PADDING_PX,
  RW_AREA_FLY_SECONDS,
  RW_AREA_FRAME_CLASS,
  RW_AREA_POINT_ZOOM,
  RW_AREA_SELECT_MAX_ZOOM,
  RW_AREA_ZOOM_SNAP,
} from '@/config/map';
import { rwAccentClasses, rwLabel, rwNumber, type RwId } from '@/config/rw';
import { RW_AREA_MAP } from '@/config/rw-areas';
import { cn } from '@/lib/utils/cn';
import type { PolygonRings, Position } from '@/lib/utils/geo-polygon';
import type { GeoMarker, PointSelection, RwAreaSelection, RwAreaSummary } from '@/types/map';

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
// An RW's positions are nested polygon > ring > position; its bounds need the positions alone.
const RING_DEPTH = 2;

function areaBoundsOf(rw: RwId): LatLngBounds | null {
  const positions = AREA_LATLNGS.get(rw);
  return positions === undefined ? null : latLngBounds(positions.flat(RING_DEPTH));
}

// DESIGN-SPEC §3.9 opens on the kampung edukasi, so their points stand apart; the reset button shows the whole
// kelurahan. Without an edu-tourism RW the map opens on the kelurahan.
function openingBoundsOf(areas: readonly RwAreaSummary[]): LatLngBounds {
  const eduBounds = areas.flatMap((area) => {
    const bounds = area.unit ? areaBoundsOf(area.rw) : null;
    return bounds ? [bounds] : [];
  });
  const [first, ...rest] = eduBounds;
  if (!first) return KELURAHAN_BOUNDS;
  return rest.reduce(
    (all, bounds) => all.extend(bounds),
    latLngBounds(first.getSouthWest(), first.getNorthEast()),
  );
}
const FIT_PADDING: [number, number] = [RW_AREA_FIT_PADDING_PX, RW_AREA_FIT_PADDING_PX];
const FIT_OPTIONS = { padding: FIT_PADDING };
// The boundary is an outline only and never takes a click from the RW under it.
const BOUNDARY_PATH = { className: RW_AREA_CLASS.boundary, fill: false, interactive: false };
// Leaflet's own markers need a size; the label centres itself on the point in CSS (src/styles/globals.css).
const LABEL_ICON_SIZE: [number, number] = [0, 0];

export interface RwAreaLeafletProps {
  areas: readonly RwAreaSummary[];
  // The activity points with coordinates.
  markers: readonly GeoMarker[];
  selection: RwAreaSelection | null;
  pointSelection: PointSelection | null;
  onSelectPoint: (id: string) => void;
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

// The RW's number inside its area; an edu-tourism RW's sits as an accent pill (`RW 05`) on its area's top edge, clear
// of the points in the middle (DESIGN-SPEC §3.9). Not interactive: a click passes to the shape under it. The html is
// the label from rwLabel or the two digits of rwNumber, never text from the database.
function AreaLabel({ area }: { area: RwAreaSummary }) {
  const icon = useMemo(
    () =>
      divIcon({
        className: cn(
          RW_AREA_CLASS.label,
          rwAccentClasses(area.unit?.accentKey ?? null).plan,
          area.unit && RW_AREA_CLASS.labelEdu,
        ),
        html: `<span>${area.unit ? rwLabel(area.rw) : rwNumber(area.rw)}</span>`,
        iconSize: LABEL_ICON_SIZE,
      }),
    [area.rw, area.unit],
  );
  const north = area.unit ? areaBoundsOf(area.rw)?.getNorth() : undefined;
  return (
    <Marker
      position={[north ?? area.centre.lat, area.centre.lng]}
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

// A point picked in the list is brought into view and its card opens; one clicked on the map is already in view.
function useFramePoint(
  map: LeafletMapInstance | null,
  markers: readonly GeoMarker[],
  pointSelection: PointSelection | null,
  prefersReducedMotion: boolean,
) {
  useEffect(() => {
    if (map === null || pointSelection?.source !== 'list') return;
    const marker = markers.find((candidate) => candidate.id === pointSelection.id);
    if (!marker) return;
    const zoom = Math.max(map.getZoom(), RW_AREA_POINT_ZOOM);
    if (prefersReducedMotion) map.setView([marker.lat, marker.lng], zoom, { animate: false });
    else map.flyTo([marker.lat, marker.lng], zoom, { duration: RW_AREA_FLY_SECONDS });
  }, [map, markers, pointSelection, prefersReducedMotion]);
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

// Leaflet's own controls and credit give way to the redesign's (the stacked buttons, the credit in the corner); the
// wheel never zooms the map while the page scrolls past it. A visitor who asked for less motion gets every zoom and
// fade at once.
function mapOptions(prefersReducedMotion: boolean) {
  const animate = !prefersReducedMotion;
  return {
    maxZoom: GEO_MAX_ZOOM,
    zoomSnap: RW_AREA_ZOOM_SNAP,
    zoomControl: false,
    attributionControl: false,
    scrollWheelZoom: false,
    zoomAnimation: animate,
    fadeAnimation: animate,
    markerZoomAnimation: animate,
  };
}

type PointLayerProps = Pick<RwAreaLeafletProps, 'markers' | 'pointSelection' | 'onSelectPoint'>;

function PointLayer({ markers, pointSelection, onSelectPoint }: PointLayerProps) {
  return markers.map((marker, index) => (
    <PointMarker
      key={marker.id}
      marker={marker}
      index={index}
      isSelected={pointSelection?.id === marker.id}
      onSelect={onSelectPoint}
    />
  ));
}

// docs/PRD.md FR-PUB-18: the kelurahan's 13 RW areas over OpenStreetMap tiles, the edu-tourism RWs in their accent
// and the others in the neutral fill, with the boundary as an outline, the office and the activity points. The view
// fits the boundary. Leaflet's shapes take no keyboard focus, so the list beside the map (RwAreaList) is the
// keyboard and screen-reader path to the same content.
export function RwAreaLeaflet({
  markers,
  pointSelection,
  onSelectPoint,
  ...layers
}: RwAreaLeafletProps) {
  const [map, setMap] = useState<LeafletMapInstance | null>(null);
  const prefersReducedMotion = useReducedMotion() === true;
  useFrameSelection(map, layers.selection, prefersReducedMotion);
  useFramePoint(map, markers, pointSelection, prefersReducedMotion);
  const openingBounds = useMemo(() => openingBoundsOf(layers.areas), [layers.areas]);
  return (
    <>
      <MapContainer
        ref={setMap}
        bounds={openingBounds}
        boundsOptions={FIT_OPTIONS}
        {...mapOptions(prefersReducedMotion)}
        className={cn('isolate bg-muted map-tiles-warm', RW_AREA_FRAME_CLASS)}
      >
        <TileLayer url={OSM_TILE_URL} maxZoom={GEO_MAX_ZOOM} />
        <AreaLayers {...layers} />
        <OfficeMarker />
        <PointLayer
          markers={markers}
          pointSelection={pointSelection}
          onSelectPoint={onSelectPoint}
        />
      </MapContainer>
      {map ? (
        <MapControls
          map={map}
          prefersReducedMotion={prefersReducedMotion}
          resetBounds={KELURAHAN_BOUNDS}
          fitOptions={FIT_OPTIONS}
        />
      ) : null}
    </>
  );
}
