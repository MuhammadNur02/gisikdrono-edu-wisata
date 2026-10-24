import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { readRwAreaMap } from '@/lib/utils/rw-area-map';

const SQUARE = [
  [110.38, -6.99],
  [110.39, -6.99],
  [110.39, -6.98],
  [110.38, -6.98],
  [110.38, -6.99],
];

function collection(features: unknown[]) {
  return { type: 'FeatureCollection', features };
}

const BOUNDARY = {
  type: 'Feature',
  properties: { kind: 'boundary', name: 'Batas' },
  geometry: { type: 'Polygon', coordinates: [SQUARE] },
};
const OFFICE = {
  type: 'Feature',
  properties: { kind: 'office', name: 'Kantor' },
  geometry: { type: 'Point', coordinates: [110.385, -6.985] },
};
function area(rw: number) {
  return {
    type: 'Feature',
    properties: { kind: 'rw', rw, name: `RW ${String(rw).padStart(2, '0')}` },
    geometry: { type: 'MultiPolygon', coordinates: [[SQUARE]] },
  };
}

describe('readRwAreaMap', () => {
  it('reads the boundary, the office and the RWs by number', () => {
    const map = readRwAreaMap(collection([area(13), BOUNDARY, area(5), OFFICE]));
    expect(map.boundary).toEqual([SQUARE]);
    expect(map.office).toEqual({ name: 'Kantor', position: [110.385, -6.985] });
    expect(map.areas.map((entry) => entry.rw)).toEqual([5, 13]);
  });

  it('refuses what is not a FeatureCollection', () => {
    expect(() => readRwAreaMap(null)).toThrow(/FeatureCollection/);
    expect(() => readRwAreaMap({ type: 'Feature' })).toThrow(/FeatureCollection/);
  });

  it('refuses a feature it does not draw', () => {
    const broken = { ...area(5), geometry: { type: 'MultiPolygon', coordinates: [[[[110, -6]]]] } };
    expect(() => readRwAreaMap(collection([BOUNDARY, OFFICE, broken]))).toThrow(/feature 2/);
    expect(() => readRwAreaMap(collection([BOUNDARY, OFFICE, { type: 'Feature' }]))).toThrow(
      /feature 2/,
    );
    const unnamed = { ...OFFICE, properties: { kind: 'office' } };
    expect(() => readRwAreaMap(collection([BOUNDARY, unnamed, area(5)]))).toThrow(/feature 1/);
  });

  it('needs the boundary, the office and an RW', () => {
    expect(() => readRwAreaMap(collection([OFFICE, area(5)]))).toThrow(/boundary/);
    expect(() => readRwAreaMap(collection([BOUNDARY, area(5)]))).toThrow(/office/);
    expect(() => readRwAreaMap(collection([BOUNDARY, OFFICE]))).toThrow(/at least one RW/);
  });

  it('reads the committed map of the kelurahan: 13 RWs inside one boundary', () => {
    const path = fileURLToPath(
      new URL('../../../public/map/gisikdrono-rw.geojson', import.meta.url),
    );
    const map = readRwAreaMap(JSON.parse(readFileSync(path, 'utf8')));
    expect(map.areas.map((entry) => entry.rw)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]);
    expect(map.office.name).toBe('Kantor Kelurahan Gisikdrono');
  });
});
