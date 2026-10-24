import { describe, expect, it } from 'vitest';

import { areaCentreOf, buildRwAreaSummaries } from '@/lib/utils/rw-area-summaries';
import type { ActivityPoint } from '@/types/activity-point';
import type { RwAreaMapData } from '@/types/map';
import type { RwUnitProfile } from '@/types/rw-unit';

type RwArea = RwAreaMapData['areas'][number];

function square(rw: number, west: number): RwArea {
  return {
    rw,
    name: `RW ${String(rw).padStart(2, '0')}`,
    polygons: [
      [
        [
          [west, -6.99],
          [west + 0.01, -6.99],
          [west + 0.01, -6.98],
          [west, -6.98],
          [west, -6.99],
        ],
      ],
    ],
  };
}

function unit(mapLat: number | null, mapLng: number | null): RwUnitProfile {
  return {
    id: 5,
    label: 'RW 05',
    slug: 'rw-05-ecowastreme',
    path: '/rw-05-ecowastreme',
    name: 'RW 05 Ecowastreme',
    shortName: 'Ecowastreme',
    accentKey: 'leaf',
    iconKey: 'recycle',
    scheduleEnabled: false,
    productsHeading: null,
    themeLabel: 'Ekowisata',
    tagline: null,
    descriptionMd: null,
    visionMd: null,
    heroImage: null,
    contactPhone: null,
    contactEmail: null,
    mapLat,
    mapLng,
  };
}

function point(id: string, lat: number | null, lng: number | null): ActivityPoint {
  return {
    id,
    rwId: 5,
    slug: id,
    name: `Titik ${id}`,
    pointType: 'bank_sampah',
    shortDescription: null,
    bodyMd: null,
    image: null,
    mapX: null,
    mapY: null,
    svgHotspotId: null,
    lat,
    lng,
  };
}

describe('areaCentreOf', () => {
  it('takes the centre the kelurahan set', () => {
    expect(areaCentreOf(square(5, 110.38), unit(-6.1, 110.1))).toEqual({ lat: -6.1, lng: 110.1 });
  });

  it('otherwise takes a point inside the area', () => {
    const centre = areaCentreOf(square(5, 110.38), unit(null, null));
    expect(centre?.lat).toBeCloseTo(-6.985);
    expect(centre?.lng).toBeCloseTo(110.385);
    expect(areaCentreOf(square(7, 110.38), null)?.lng).toBeCloseTo(110.385);
  });

  it('is NULL for an area without surface', () => {
    expect(areaCentreOf({ rw: 1, name: 'RW 01', polygons: [] }, null)).toBeNull();
  });
});

describe('buildRwAreaSummaries', () => {
  const summaries = buildRwAreaSummaries(
    [square(5, 110.38), square(7, 110.4), { rw: 9, name: 'RW 09', polygons: [] }],
    [unit(null, null)],
    [point('a', -6.985, 110.385), point('b', null, null)],
  );

  it('lists every RW with a surface, in the map order', () => {
    expect(summaries.map((summary) => summary.label)).toEqual(['RW 05', 'RW 07']);
  });

  it('gives an RW online its programme, page and points', () => {
    const [rw05] = summaries;
    expect(rw05?.unit).toEqual({
      name: 'RW 05 Ecowastreme',
      shortName: 'Ecowastreme',
      path: '/rw-05-ecowastreme',
      accentKey: 'leaf',
    });
    expect(rw05?.points.map((entry) => [entry.name, entry.typeLabel])).toEqual([
      ['Titik a', 'Bank Sampah'],
      ['Titik b', 'Bank Sampah'],
    ]);
    expect(rw05?.points[0]?.routeUrl).toContain('destination=-6.985%2C110.385');
    expect(rw05?.points[1]?.routeUrl).toBeNull();
    expect(rw05?.routeUrl).toContain('https://www.google.com/maps/dir/?api=1&destination=');
  });

  it('leaves another RW without unit or points', () => {
    expect(summaries[1]).toMatchObject({ rw: 7, unit: null, points: [] });
  });
});
