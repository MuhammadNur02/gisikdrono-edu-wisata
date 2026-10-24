import { SEEDED_POINT_ESTIMATES, SEEDED_RW_CENTRE_ESTIMATES } from '@/config/map-estimates';
import type { RwId } from '@/config/rw';
import type { GeoPoint } from '@/lib/utils/geo';

// Whether a position on the map is still the estimate the demo seed wrote (src/config/map-estimates.ts). The
// columns are numeric(9,6), so an untouched row returns the seeded value exactly; any edit of a whole unit in the
// sixth decimal or more is the kelurahan's own position.
export const ESTIMATE_TOLERANCE_DEGREES = 1e-6;

interface Located {
  lat: number | null;
  lng: number | null;
}

function isAt(position: Located, estimate: GeoPoint | undefined): boolean {
  if (estimate === undefined || position.lat === null || position.lng === null) return false;
  return (
    Math.abs(position.lat - estimate.lat) < ESTIMATE_TOLERANCE_DEGREES &&
    Math.abs(position.lng - estimate.lng) < ESTIMATE_TOLERANCE_DEGREES
  );
}

export function isSeededPointEstimate(point: Located & { rwId: RwId; slug: string }): boolean {
  const estimate = SEEDED_POINT_ESTIMATES[point.slug];
  return estimate?.rwId === point.rwId && isAt(point, estimate);
}

export function isSeededRwCentreEstimate(rwId: RwId, centre: Located): boolean {
  return isAt(centre, SEEDED_RW_CENTRE_ESTIMATES[rwId]);
}
