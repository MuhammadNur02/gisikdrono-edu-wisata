import { rwLabel } from '@/config/rw';
import { ACTIVITY_POINT_TYPE } from '@/config/status';
import { googleMapsDirectionsUrl, type GeoPoint } from '@/lib/utils/geo';
import { pointOnSurface } from '@/lib/utils/geo-polygon';
import { isSeededPointEstimate, isSeededRwCentreEstimate } from '@/lib/utils/map-estimates';
import type { ActivityPoint } from '@/types/activity-point';
import type { RwAreaMapData, RwAreaSummary } from '@/types/map';
import type { RwUnitProfile } from '@/types/rw-unit';

type RwArea = RwAreaMapData['areas'][number];

// Where an RW's route link and label point: the centre the kelurahan set in rw_units, otherwise a point inside the
// area itself (pointOnSurface), never the bounding box's middle, which can fall in the next RW.
export function areaCentreOf(area: RwArea, unit: RwUnitProfile | null): GeoPoint | null {
  if (unit?.mapLat != null && unit.mapLng != null) return { lat: unit.mapLat, lng: unit.mapLng };
  const inside = pointOnSurface(area.polygons);
  return inside === null ? null : { lat: inside[1], lng: inside[0] };
}

// A centre the kelurahan has not set: the point inside the area, or the one the demo seed estimated.
function isCentreEstimate(rw: number, unit: RwUnitProfile | null): boolean {
  if (unit?.mapLat == null || unit.mapLng == null) return true;
  return isSeededRwCentreEstimate(rw, { lat: unit.mapLat, lng: unit.mapLng });
}

function pointsOf(rw: number, points: readonly ActivityPoint[]): RwAreaSummary['points'] {
  return points
    .filter((point) => point.rwId === rw)
    .map((point) => ({
      id: point.id,
      name: point.name,
      typeLabel: ACTIVITY_POINT_TYPE[point.pointType].label,
      routeUrl:
        point.lat !== null && point.lng !== null
          ? googleMapsDirectionsUrl({ lat: point.lat, lng: point.lng })
          : null,
      isEstimate: isSeededPointEstimate(point),
    }));
}

// docs/PRD.md FR-PUB-18: every RW of the kelurahan's map, in number order, for the list beside the map and its panel.
// An RW online in rw_units (the edu-tourism RWs) carries its programme, page and points; the others only their number.
export function buildRwAreaSummaries(
  areas: readonly RwArea[],
  units: readonly RwUnitProfile[],
  points: readonly ActivityPoint[],
): RwAreaSummary[] {
  return areas.flatMap((area) => {
    const unit = units.find((candidate) => candidate.id === area.rw) ?? null;
    const centre = areaCentreOf(area, unit);
    if (centre === null) return [];
    return [
      {
        rw: area.rw,
        label: rwLabel(area.rw),
        centre,
        routeUrl: googleMapsDirectionsUrl(centre),
        centreIsEstimate: isCentreEstimate(area.rw, unit),
        unit: unit && {
          name: unit.name,
          shortName: unit.shortName,
          path: unit.path,
          accentKey: unit.accentKey,
        },
        points: pointsOf(area.rw, points),
      },
    ];
  });
}
