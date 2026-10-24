// Converts the KML export of the kelurahan's own Google My Maps "Peta RW Wilayah Gisikdrono 2024" (embedded on
// https://gisikdrono.semarangkota.go.id/peta-wilayah-rw; the kelurahan allowed reuse of its site content) into the
// compact GeoJSON the RW area map of /peta-kontak draws (public/map/gisikdrono-rw.geojson, docs/PRD.md FR-PUB-18).
//
//   pnpm exec tsx scripts/convert-rw-kml.ts <path/to/peta-rw-gisikdrono-2024.kml> [out.geojson]
//
// What it keeps: one MultiPolygon per RW (placemarks named `RW.05` or `RW05` of the same number merge), the
// kelurahan boundary (`Batas Wilayah`) and the office point (`Kantor Kelurahan ...`), each with only `kind`, `name`
// and, for an RW, `rw`. The placemark descriptions (population counts and the like) and the styles are left out, and
// so is the `Rawan Bencana` layer, which the 2024 export leaves empty. Coordinates are rounded to six decimals and
// simplified lightly (about half a metre). The KML itself stays outside the repository; the GeoJSON names its source
// in its own `attribution` and `source` members, and the map repeats the credit under itself.
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

import { RW_ID_MAX, RW_ID_MIN, rwLabel } from '../src/config/rw';
import {
  roundPosition,
  simplifyRing,
  type PolygonRings,
  type Position,
} from '../src/lib/utils/geo-polygon';
import type {
  RwAreaBoundaryFeature,
  RwAreaCollection,
  RwAreaFeature,
  RwAreaOfficeFeature,
} from '../src/types/map';

export const RW_AREA_SOURCE = {
  name: 'Peta RW Wilayah Gisikdrono 2024',
  attribution: 'Batas RW: Peta RW Wilayah Gisikdrono 2024, Kelurahan Gisikdrono',
  source: 'https://gisikdrono.semarangkota.go.id/peta-wilayah-rw',
} as const;
export const DEFAULT_OUTPUT_PATH = 'public/map/gisikdrono-rw.geojson';
// About 0.55 m at this latitude: drops only the positions that sit on a straight edge.
export const SIMPLIFY_TOLERANCE_DEGREES = 0.000005;
// The arguments after `node` and the script's own path.
const FIRST_ARGUMENT = 2;
const USAGE_EXIT = 2;
const BOUNDARY_NAME = 'Batas Wilayah Kelurahan Gisikdrono';
// Layers of the export that are not drawn. A My Maps export has one flat Folder per layer.
const EXCLUDED_FOLDERS = [/^rawan bencana$/i];

const FOLDER = /<Folder\b[^>]*>([\s\S]*?)<\/Folder>/g;
const PLACEMARK = /<Placemark\b[^>]*>([\s\S]*?)<\/Placemark>/g;
const NAME = /<name>([\s\S]*?)<\/name>/;
const POLYGON = /<Polygon\b[^>]*>([\s\S]*?)<\/Polygon>/g;
const OUTER_RING = /<outerBoundaryIs>[\s\S]*?<coordinates>([\s\S]*?)<\/coordinates>/;
const INNER_RING = /<innerBoundaryIs>[\s\S]*?<coordinates>([\s\S]*?)<\/coordinates>/g;
const POINT = /<Point\b[^>]*>[\s\S]*?<coordinates>([\s\S]*?)<\/coordinates>/;
const CDATA = /^<!\[CDATA\[([\s\S]*)\]\]>$/;
const RW_NAME = /^RW\s*\.?\s*0*(\d{1,2})$/i;
const BOUNDARY_PLACEMARK = /^batas wilayah$/i;
const OFFICE_PLACEMARK = /^kantor kelurahan\b/i;
const XML_ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&apos;': "'",
};

interface Placemark {
  name: string;
  polygons: PolygonRings[];
  point: Position | null;
}

function textOf(raw: string): string {
  const trimmed = raw.trim();
  const unwrapped = CDATA.exec(trimmed)?.[1] ?? trimmed;
  return unwrapped
    .replace(/&(amp|lt|gt|quot|apos);/g, (entity) => XML_ENTITIES[entity] ?? entity)
    .trim();
}

// `lng,lat[,alt]` tuples separated by whitespace, rounded to six decimals.
export function parseCoordinates(raw: string): Position[] {
  return raw
    .trim()
    .split(/\s+/)
    .filter((tuple) => tuple !== '')
    .map((tuple) => {
      const [lng, lat] = tuple.split(',').map(Number);
      if (
        lng === undefined ||
        lat === undefined ||
        !Number.isFinite(lng) ||
        !Number.isFinite(lat)
      ) {
        throw new Error(`not a KML coordinate: ${tuple}`);
      }
      return roundPosition([lng, lat]);
    });
}

function ringFrom(raw: string): Position[] {
  return [...simplifyRing(parseCoordinates(raw), SIMPLIFY_TOLERANCE_DEGREES)];
}

function polygonsOf(body: string): PolygonRings[] {
  return [...body.matchAll(POLYGON)].flatMap((match) => {
    const polygon = match[1] ?? '';
    const outer = OUTER_RING.exec(polygon)?.[1];
    if (outer === undefined) return [];
    const holes = [...polygon.matchAll(INNER_RING)].map((hole) => ringFrom(hole[1] ?? ''));
    return [[ringFrom(outer), ...holes]];
  });
}

function placemarkOf(body: string): Placemark {
  const point = POINT.exec(body)?.[1];
  const [position] = point === undefined ? [] : parseCoordinates(point);
  return {
    name: textOf(NAME.exec(body)?.[1] ?? ''),
    polygons: polygonsOf(body),
    point: position ?? null,
  };
}

function withoutExcludedFolders(kml: string): string {
  return kml.replace(FOLDER, (folder, body: string) => {
    const name = textOf(NAME.exec(body)?.[1] ?? '');
    return EXCLUDED_FOLDERS.some((pattern) => pattern.test(name)) ? '' : folder;
  });
}

export function rwNumberOf(name: string): number | null {
  const digits = RW_NAME.exec(name)?.[1];
  const rw = digits === undefined ? null : Number(digits);
  return rw !== null && rw >= RW_ID_MIN && rw <= RW_ID_MAX ? rw : null;
}

function rwFeatures(placemarks: readonly Placemark[]): RwAreaFeature[] {
  const polygonsByRw = new Map<number, PolygonRings[]>();
  for (const placemark of placemarks) {
    const rw = rwNumberOf(placemark.name);
    if (rw === null || placemark.polygons.length === 0) continue;
    polygonsByRw.set(rw, [...(polygonsByRw.get(rw) ?? []), ...placemark.polygons]);
  }
  return [...polygonsByRw.entries()]
    .sort(([a], [b]) => a - b)
    .map(([rw, polygons]) => ({
      type: 'Feature',
      properties: { kind: 'rw', rw, name: rwLabel(rw) },
      geometry: { type: 'MultiPolygon', coordinates: polygons },
    }));
}

function boundaryFeature(placemarks: readonly Placemark[]): RwAreaBoundaryFeature {
  const [polygon] =
    placemarks.find((placemark) => BOUNDARY_PLACEMARK.test(placemark.name))?.polygons ?? [];
  if (polygon === undefined) throw new Error('the KML has no "Batas Wilayah" polygon');
  return {
    type: 'Feature',
    properties: { kind: 'boundary', name: BOUNDARY_NAME },
    geometry: { type: 'Polygon', coordinates: polygon },
  };
}

function officeFeature(placemarks: readonly Placemark[]): RwAreaOfficeFeature {
  const office = placemarks.find((placemark) => OFFICE_PLACEMARK.test(placemark.name));
  if (office?.point == null) throw new Error('the KML has no "Kantor Kelurahan" point');
  return {
    type: 'Feature',
    properties: { kind: 'office', name: office.name },
    geometry: { type: 'Point', coordinates: office.point },
  };
}

export function convertRwKml(kml: string): RwAreaCollection {
  const placemarks = [...withoutExcludedFolders(kml).matchAll(PLACEMARK)].map((match) =>
    placemarkOf(match[1] ?? ''),
  );
  const areas = rwFeatures(placemarks);
  if (areas.length === 0) throw new Error('the KML has no RW polygon named like "RW.05"');
  return {
    type: 'FeatureCollection',
    ...RW_AREA_SOURCE,
    features: [boundaryFeature(placemarks), ...areas, officeFeature(placemarks)],
  };
}

// One feature per line, so a later export shows in a diff as the RWs whose lines changed.
export function serializeCollection(collection: RwAreaCollection): string {
  const { features, ...members } = collection;
  const head = JSON.stringify(members).slice(0, -1);
  return `${head},"features":[\n${features.map((feature) => JSON.stringify(feature)).join(',\n')}\n]}\n`;
}

function main(): number {
  const [kmlPath, outPath = DEFAULT_OUTPUT_PATH] = process.argv.slice(FIRST_ARGUMENT);
  if (kmlPath === undefined) {
    process.stderr.write('usage: tsx scripts/convert-rw-kml.ts <peta-rw.kml> [out.geojson]\n');
    return USAGE_EXIT;
  }
  const collection = convertRwKml(readFileSync(kmlPath, 'utf8'));
  writeFileSync(outPath, serializeCollection(collection));
  const rws = collection.features.flatMap((feature) =>
    feature.properties.kind === 'rw' ? [feature.properties.name] : [],
  );
  process.stdout.write(
    `${String(rws.length)} RW areas (${rws.join(', ')}), boundary and office -> ${outPath}\n`,
  );
  return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  process.exitCode = main();
}
