// Geography of /peta-kontak and the home map (docs/PRD.md FR-PUB-18): where the maps centre and the Google Maps
// addresses the page links to. Pure, so the page and its tests share the same arithmetic.

export interface GeoPoint {
  lat: number;
  lng: number;
}

const GOOGLE_MAPS_DIRECTIONS_URL = 'https://www.google.com/maps/dir/?api=1';
const GOOGLE_MAPS_SEARCH_URL = 'https://www.google.com/maps/search/?api=1';
// The one path docs/Security.md §8.2 lets a frame load from Google.
const GOOGLE_MAPS_EMBED_URL = 'https://www.google.com/maps/embed';
// The embed's "pb" parameter without a place: a map centred on a point. 1d is the viewing distance Google's own
// share dialog writes for a neighbourhood (about zoom 15); the rest is the dialog's fixed frame size and language.
const GOOGLE_EMBED_DISTANCE = 3000;
const GOOGLE_EMBED_FRAME = '2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!5e0!3m2!1sid!2sid';

// The points among `candidates` that have both coordinates; a row with one of the two is left out.
export function locatedPoints<T extends { lat: number | null; lng: number | null }>(
  candidates: readonly T[],
): (T & GeoPoint)[] {
  return candidates.filter(
    (point): point is T & GeoPoint => point.lat !== null && point.lng !== null,
  );
}

// The arithmetic mean, which is close enough to the true centre across one kelurahan.
export function geoCentroid(points: readonly GeoPoint[]): GeoPoint | null {
  if (points.length === 0) return null;
  const sum = points.reduce(
    (total, point) => ({ lat: total.lat + point.lat, lng: total.lng + point.lng }),
    { lat: 0, lng: 0 },
  );
  return { lat: sum.lat / points.length, lng: sum.lng / points.length };
}

function coordinateQuery(point: GeoPoint): string {
  return `${String(point.lat)},${String(point.lng)}`;
}

// A destination for "Rute di Google Maps": the office address as the kelurahan writes it, or a point.
export function googleMapsDirectionsUrl(destination: string | GeoPoint): string {
  const query = typeof destination === 'string' ? destination : coordinateQuery(destination);
  return `${GOOGLE_MAPS_DIRECTIONS_URL}&destination=${encodeURIComponent(query)}`;
}

// The page a point opens on Google Maps; JSON-LD `hasMap` names it.
export function googleMapsPlaceUrl(point: GeoPoint): string {
  return `${GOOGLE_MAPS_SEARCH_URL}&query=${encodeURIComponent(coordinateQuery(point))}`;
}

export function googleMapsEmbedUrl(centre: GeoPoint): string {
  const view = `!1m14!1m12!1m3!1d${String(GOOGLE_EMBED_DISTANCE)}!2d${String(centre.lng)}!3d${String(centre.lat)}!${GOOGLE_EMBED_FRAME}`;
  return `${GOOGLE_MAPS_EMBED_URL}?pb=${view}`;
}
