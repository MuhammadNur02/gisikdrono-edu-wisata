// The site plan and the maps of docs/PRD.md FR-PUB-03 and FR-PUB-18 (docs/StyleGuide.md §5.13, §8.3).

// public/map/denah.svg is drawn in a 1600 × 1000 box; the plan keeps those proportions at every width.
export const PLAN_ASPECT_CLASS = 'aspect-16/10';
export const PLAN_MIN_SCALE = 1;
export const PLAN_MAX_SCALE = 4;
// An open hotspot grows this much (§5.13).
export const HOTSPOT_ACTIVE_SCALE = 1.15;
// The class the plan element bound to an open hotspot carries (src/styles/globals.css).
export const PLAN_ACTIVE_CLASS = 'denah-active';
// The class of every hotspot button: react-zoom-pan-pinch never starts a pan from an element that carries it,
// so a press on a hotspot stays a click (review of PR #29).
export const PLAN_HOTSPOT_CLASS = 'denah-hotspot';
// The element ids of public/map/denah.svg a point may bind to (activity_points.svg_hotspot_id, docs/StyleGuide.md
// §8.3); the commissioned plan keeps them (the file's own comment lists the same). The CMS offers exactly these.
export const PLAN_HOTSPOT_IDS = [
  'rw-05-area',
  'rw-05-bank-sampah',
  'rw-05-kebun-toga',
  'rw-05-komposter',
  'rw-05-maggot',
  'rw-05-kerajinan-pkk',
  'rw-13-area',
  'rw-13-panggung',
  'rw-13-sanggar',
  'rw-13-dolanan',
  'rw-13-mural',
  'rw-08-area',
  'rw-08-balai-warga',
  'rw-08-semar-cakep',
  'rw-08-kantor-layanan',
] as const;
export type PlanHotspotId = (typeof PLAN_HOTSPOT_IDS)[number];

export function isPlanHotspotId(value: string | null): value is PlanHotspotId {
  return value !== null && PLAN_HOTSPOT_IDS.some((id) => id === value);
}

// OpenStreetMap's standard tiles, the one tile host docs/Security.md §8.2 allows in img-src; the credit next to
// the map is a condition of the OSM tile usage policy.
export const OSM_TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
export const OSM_TILE_HOST = 'tile.openstreetmap.org';
export const OSM_COPYRIGHT_URL = 'https://www.openstreetmap.org/copyright';
// The host the Google Maps frame loads from once the visitor asks for it (docs/Security.md §8.2).
export const GOOGLE_MAPS_HOST = 'www.google.com';

// Leaflet zoom levels: the tiles stop at 19; a view fitted to the markers never zooms past a neighbourhood.
export const GEO_MAX_ZOOM = 19;
export const GEO_FIT_MAX_ZOOM = 17;
// The view around a single marker, or the one both maps open on.
export const GEO_SINGLE_MARKER_ZOOM = 16;
export const GEO_FIT_PADDING_PX = 32;
// Circle markers, in pixels: an RW's centre a little larger than an activity point.
export const GEO_RW_MARKER_RADIUS = 10;
export const GEO_POINT_MARKER_RADIUS = 7;
