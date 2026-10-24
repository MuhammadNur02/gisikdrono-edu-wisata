import type { PolygonRings, Position } from '@/lib/utils/geo-polygon';
import type { RwAreaMapData } from '@/types/map';

// Reads public/map/gisikdrono-rw.geojson (scripts/convert-rw-kml.ts) into what the RW area map draws, checking its
// shape on the way: the file is imported as untyped JSON, so nothing about it is assumed. A file that is not the
// converter's output fails here, at build time, rather than as a blank map in a visitor's browser.

type UnknownRecord = Record<string, unknown>;
type RwArea = RwAreaMapData['areas'][number];
type ReadFeature =
  | { kind: 'boundary'; polygon: PolygonRings }
  | ({ kind: 'rw' } & RwArea)
  | { kind: 'office'; name: string; position: Position };

// A closed ring has a triangle's three positions plus the closing one.
const MIN_RING_POSITIONS = 4;
const POSITION_LENGTH = 2;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isPosition(value: unknown): value is Position {
  return (
    Array.isArray(value) &&
    value.length === POSITION_LENGTH &&
    value.every((coordinate) => typeof coordinate === 'number' && Number.isFinite(coordinate))
  );
}

function isRing(value: unknown): value is Position[] {
  return Array.isArray(value) && value.length >= MIN_RING_POSITIONS && value.every(isPosition);
}

function isPolygon(value: unknown): value is Position[][] {
  return Array.isArray(value) && value.length > 0 && value.every(isRing);
}

function isMultiPolygon(value: unknown): value is Position[][][] {
  return Array.isArray(value) && value.length > 0 && value.every(isPolygon);
}

interface FeatureParts {
  properties: UnknownRecord;
  type: unknown;
  coordinates: unknown;
}

function partsOf(feature: unknown): FeatureParts | null {
  if (!isRecord(feature) || !isRecord(feature.properties) || !isRecord(feature.geometry))
    return null;
  const { type, coordinates } = feature.geometry;
  return { properties: feature.properties, type, coordinates };
}

function readBoundary({ type, coordinates }: FeatureParts): ReadFeature | null {
  return type === 'Polygon' && isPolygon(coordinates)
    ? { kind: 'boundary', polygon: coordinates }
    : null;
}

function readArea(
  { properties, type, coordinates }: FeatureParts,
  name: string,
): ReadFeature | null {
  const { rw } = properties;
  if (typeof rw !== 'number' || type !== 'MultiPolygon' || !isMultiPolygon(coordinates))
    return null;
  return { kind: 'rw', rw, name, polygons: coordinates };
}

function readOffice({ type, coordinates }: FeatureParts, name: string): ReadFeature | null {
  return type === 'Point' && isPosition(coordinates)
    ? { kind: 'office', name, position: coordinates }
    : null;
}

function readFeature(feature: unknown): ReadFeature | null {
  const parts = partsOf(feature);
  const name = parts?.properties.name;
  if (parts === null || typeof name !== 'string') return null;
  switch (parts.properties.kind) {
    case 'boundary':
      return readBoundary(parts);
    case 'rw':
      return readArea(parts, name);
    case 'office':
      return readOffice(parts, name);
    default:
      return null;
  }
}

function readFeatures(raw: unknown): ReadFeature[] {
  if (!isRecord(raw) || raw.type !== 'FeatureCollection' || !Array.isArray(raw.features)) {
    throw new Error('the RW area map is not a GeoJSON FeatureCollection');
  }
  const features: unknown[] = raw.features;
  return features.map((feature, index) => {
    const read = readFeature(feature);
    if (read === null)
      throw new Error(`feature ${String(index)} of the RW area map is not one it draws`);
    return read;
  });
}

export function readRwAreaMap(raw: unknown): RwAreaMapData {
  const features = readFeatures(raw);
  const boundary = features.find((feature) => feature.kind === 'boundary');
  const office = features.find((feature) => feature.kind === 'office');
  const areas = features.flatMap((feature) =>
    feature.kind === 'rw'
      ? [{ rw: feature.rw, name: feature.name, polygons: feature.polygons }]
      : [],
  );
  if (boundary === undefined || office === undefined || areas.length === 0) {
    throw new Error('the RW area map needs its boundary, its office and at least one RW');
  }
  return {
    boundary: boundary.polygon,
    areas: areas.sort((a, b) => a.rw - b.rw),
    office: { name: office.name, position: office.position },
  };
}
