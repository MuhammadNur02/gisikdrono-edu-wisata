import type { RwAccent, RwId } from '@/config/rw';
import type { GeoPoint } from '@/lib/utils/geo';
import type { PolygonRings, Position } from '@/lib/utils/geo-polygon';
import type { RwBadge } from '@/types/rw-unit';

// public/map/gisikdrono-rw.geojson, written by scripts/convert-rw-kml.ts from the kelurahan's "Peta RW Wilayah
// Gisikdrono 2024": the kelurahan boundary, one MultiPolygon per RW and the office point. The collection carries its
// source in the foreign members `name`, `attribution` and `source`.
export interface RwAreaBoundaryFeature {
  type: 'Feature';
  properties: { kind: 'boundary'; name: string };
  geometry: { type: 'Polygon'; coordinates: PolygonRings };
}

export interface RwAreaFeature {
  type: 'Feature';
  properties: { kind: 'rw'; rw: RwId; name: string };
  geometry: { type: 'MultiPolygon'; coordinates: PolygonRings[] };
}

export interface RwAreaOfficeFeature {
  type: 'Feature';
  properties: { kind: 'office'; name: string };
  geometry: { type: 'Point'; coordinates: Position };
}

export interface RwAreaCollection {
  type: 'FeatureCollection';
  name: string;
  attribution: string;
  source: string;
  features: (RwAreaBoundaryFeature | RwAreaFeature | RwAreaOfficeFeature)[];
}

// The collection as the map draws it, read and checked by readRwAreaMap (src/lib/utils/rw-areas.ts).
export interface RwAreaMapData {
  boundary: PolygonRings;
  areas: { rw: RwId; name: string; polygons: PolygonRings[] }[];
  office: { name: string; position: Position };
}

// An RW area as the list beside the map and its panel show it, built on the server so it stays serialisable.
// `unit` is set for an RW online in rw_units (the edu-tourism RWs); the others are drawn in the neutral fill.
export interface RwAreaSummary {
  rw: RwId;
  label: string;
  // rw_units.map_lat / map_lng when the kelurahan has set them, otherwise a point inside the area.
  centre: GeoPoint;
  routeUrl: string;
  // The centre is a point inside the area or the seeded estimate, not a place the kelurahan has set.
  centreIsEstimate: boolean;
  unit: { name: string; shortName: string; path: string; accentKey: RwAccent } | null;
  points: {
    id: string;
    name: string;
    typeLabel: string;
    routeUrl: string | null;
    isEstimate: boolean;
  }[];
}

// The RW open in the list and highlighted on the map, and where it was chosen: an RW picked in the list is brought
// into view on the map, one clicked on the map is scrolled into view in the list.
export interface RwAreaSelection {
  rw: RwId;
  source: 'map' | 'list';
}

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
  // Still the position the demo seed estimated (src/lib/utils/map-estimates.ts): shown as `perkiraan`.
  isEstimate: boolean;
}
