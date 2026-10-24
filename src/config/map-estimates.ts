import type { RwId } from '@/config/rw';
import type { GeoPoint } from '@/lib/utils/geo';

// The positions scripts/seed-demo-content.sql gives by estimate (perkiraan): no activity point was found on
// OpenStreetMap, so each sits inside its RW polygon (docs/content/konten-situs-kelurahan.md, section 8). The schema
// has no column that marks a position as estimated yet (docs/Task.md P2.5.04), so a point counts as an estimate
// while it still holds exactly this position (isSeededPointEstimate, src/lib/utils/map-estimates.ts); once the
// kelurahan moves it in /dashboard/activity-points the label goes by itself. scripts/seed-demo-content.test.mjs
// keeps these values equal to the seed's.

export interface SeededEstimate extends GeoPoint {
  rwId: RwId;
}

// By activity_points.slug, which is unique within an RW.
export const SEEDED_POINT_ESTIMATES: Readonly<Record<string, SeededEstimate>> = {
  'bank-sampah-sumber-rejeki': { rwId: 5, lat: -6.992862, lng: 110.390212 },
  'taman-toga-sumber-saras': { rwId: 5, lat: -6.992612, lng: 110.389779 },
  'komposter-dan-eco-enzyme': { rwId: 5, lat: -6.992862, lng: 110.389346 },
  'budidaya-maggot': { rwId: 5, lat: -6.993362, lng: 110.389346 },
  'sistem-teba-modern': { rwId: 5, lat: -6.993612, lng: 110.389779 },
  'kreasi-daur-ulang-pkk': { rwId: 5, lat: -6.993362, lng: 110.390212 },
  'pentas-tari-tradisional': { rwId: 13, lat: -6.996004, lng: 110.386008 },
  'dolanan-anak': { rwId: 13, lat: -6.995754, lng: 110.385575 },
  'sekolah-seni-anak': { rwId: 13, lat: -6.996079, lng: 110.385272 },
  'upacara-serah-tampi-lurah': { rwId: 13, lat: -6.996429, lng: 110.385272 },
  'mural-dan-spot-foto': { rwId: 13, lat: -6.996754, lng: 110.385575 },
  'kampung-siaga-bencana-kebakaran': { rwId: 13, lat: -6.996504, lng: 110.386008 },
  'rumah-pemberdayaan-semar-cakep': { rwId: 8, lat: -6.981051, lng: 110.388058 },
  'ketan-ronggolawe': { rwId: 8, lat: -6.981551, lng: 110.387192 },
};

// rw_units.map_lat / map_lng by RW: the point-on-surface of each RW's polygon.
export const SEEDED_RW_CENTRE_ESTIMATES: Readonly<Partial<Record<RwId, GeoPoint>>> = {
  5: { lat: -6.993112, lng: 110.389779 },
  8: { lat: -6.981301, lng: 110.387625 },
  13: { lat: -6.996775, lng: 110.386199 },
};
