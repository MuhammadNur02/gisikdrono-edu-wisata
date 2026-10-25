import { ACTIVITY_POINT_TYPE } from '@/config/status';
import {
  geoCentroid,
  googleMapsDirectionsUrl,
  locatedPoints,
  type GeoPoint,
} from '@/lib/utils/geo';
import { isSeededPointEstimate, isSeededRwCentreEstimate } from '@/lib/utils/map-estimates';
import { rwBadgeFor } from '@/lib/utils/rw-units';
import type { ActivityPoint } from '@/types/activity-point';
import type { GeoMarker } from '@/types/map';
import type { RwUnitProfile } from '@/types/rw-unit';

// What the Leaflet map pins (docs/StyleGuide.md §5.13): the RW centres of rw_units first, then every activity point
// with coordinates. A row without both coordinates is left off the map, never guessed.
export function buildGeoMarkers(
  points: readonly ActivityPoint[],
  units: readonly RwUnitProfile[],
): GeoMarker[] {
  const rwMarkers = locatedPoints(
    units.map((unit) => ({ ...unit, lat: unit.mapLat, lng: unit.mapLng })),
  ).map((unit): GeoMarker => ({
    id: `rw-${String(unit.id)}`,
    kind: 'rw',
    name: unit.name,
    detail: null,
    rw: { id: unit.id, label: unit.label, accentKey: unit.accentKey },
    lat: unit.lat,
    lng: unit.lng,
    routeUrl: googleMapsDirectionsUrl({ lat: unit.lat, lng: unit.lng }),
    isEstimate: isSeededRwCentreEstimate(unit.id, unit),
    description: unit.tagline,
    image: null,
    rwPath: unit.path,
  }));
  const pointMarkers = locatedPoints(points).map((point): GeoMarker => ({
    id: point.id,
    kind: 'point',
    name: point.name,
    detail: ACTIVITY_POINT_TYPE[point.pointType].label,
    rw: rwBadgeFor(point.rwId, units),
    lat: point.lat,
    lng: point.lng,
    routeUrl: googleMapsDirectionsUrl({ lat: point.lat, lng: point.lng }),
    isEstimate: isSeededPointEstimate(point),
    description: point.shortDescription,
    image: point.image,
    rwPath: units.find((unit) => unit.id === point.rwId)?.path ?? null,
  }));
  return [...rwMarkers, ...pointMarkers];
}

// Where both maps centre: the RW centres when the kelurahan has set them, otherwise the points themselves.
export function mapCentreOf(markers: readonly GeoMarker[]): GeoPoint | null {
  const rwCentres = markers.filter((marker) => marker.kind === 'rw');
  return geoCentroid(rwCentres.length > 0 ? rwCentres : markers);
}
