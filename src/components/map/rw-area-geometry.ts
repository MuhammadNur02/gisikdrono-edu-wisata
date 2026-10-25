import { latLngBounds, type LatLngBounds, type LatLngTuple } from 'leaflet';

import type { RwId } from '@/config/rw';
import { RW_AREA_MAP } from '@/config/rw-areas';
import type { PolygonRings, Position } from '@/lib/utils/geo-polygon';
import type { RwAreaSummary } from '@/types/map';

// The kelurahan's map (public/map/gisikdrono-rw.geojson) in Leaflet's coordinates, for the RW area map of
// /peta-kontak (src/components/map/rw-area-leaflet.tsx). Imported only by that lazy chunk, so Leaflet stays out of
// the first load.

// GeoJSON writes [lng, lat]; Leaflet takes [lat, lng].
function toLatLng([lng, lat]: Position): LatLngTuple {
  return [lat, lng];
}

function toLatLngs(polygon: PolygonRings): LatLngTuple[][] {
  return polygon.map((ring) => ring.map(toLatLng));
}

export const BOUNDARY_LATLNGS = toLatLngs(RW_AREA_MAP.boundary);
export const KELURAHAN_BOUNDS = latLngBounds(BOUNDARY_LATLNGS.flat());
export const AREA_LATLNGS = new Map(
  RW_AREA_MAP.areas.map((area) => [area.rw, area.polygons.map(toLatLngs)]),
);
// An RW's positions are nested polygon > ring > position; its bounds need the positions alone.
export const RING_DEPTH = 2;

export function areaBoundsOf(rw: RwId): LatLngBounds | null {
  const positions = AREA_LATLNGS.get(rw);
  return positions === undefined ? null : latLngBounds(positions.flat(RING_DEPTH));
}

// DESIGN-SPEC §3.9 opens on the kampung edukasi, so their points stand apart; the reset button shows the whole
// kelurahan. Without an edu-tourism RW the map opens on the kelurahan.
export function openingBoundsOf(areas: readonly RwAreaSummary[]): LatLngBounds {
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
