// The site plan and the maps of docs/PRD.md FR-PUB-03 and FR-PUB-18 (docs/StyleGuide.md §5.13, §8.3).

// public/map/denah.svg is drawn in a 1600 × 1000 box; the plan keeps those proportions at every width.
export const PLAN_ASPECT_CLASS = 'aspect-16/10';
export const PLAN_MIN_SCALE = 1;
export const PLAN_MAX_SCALE = 4;
// An open hotspot grows this much (§5.13).
export const HOTSPOT_ACTIVE_SCALE = 1.15;
// The class the plan element bound to an open hotspot carries (src/styles/globals.css).
export const PLAN_ACTIVE_CLASS = 'denah-active';

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
