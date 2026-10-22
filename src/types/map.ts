import type { GeoPoint } from '@/lib/utils/geo';
import type { RwBadge } from '@/types/rw-unit';

// A pin on the Leaflet map (docs/StyleGuide.md §5.13): an activity point by its own coordinates, or an RW's centre
// from rw_units.map_lat / map_lng. Serialisable, so the island receives it as a prop.
export interface GeoMarker extends GeoPoint {
  id: string;
  kind: 'point' | 'rw';
  name: string;
  // The type label of an activity point; an RW centre has none.
  detail: string | null;
  rw: RwBadge;
  routeUrl: string;
}
