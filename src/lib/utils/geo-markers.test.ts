import { describe, expect, it } from 'vitest';

import { buildGeoMarkers, mapCentreOf } from '@/lib/utils/geo-markers';
import type { ActivityPoint } from '@/types/activity-point';
import type { RwUnitProfile } from '@/types/rw-unit';

function unit(id: 5 | 13, mapLat: number | null, mapLng: number | null): RwUnitProfile {
  return {
    id,
    label: `RW ${String(id).padStart(2, '0')}`,
    slug: `rw-${String(id).padStart(2, '0')}-uji`,
    path: `/rw-${String(id).padStart(2, '0')}-uji`,
    name: `RW ${String(id)} Uji`,
    shortName: 'Uji',
    accentKey: id === 5 ? 'leaf' : 'terracotta',
    iconKey: 'recycle',
    scheduleEnabled: false,
    productsHeading: null,
    themeLabel: 'Uji',
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

function point(id: string, rwId: 5 | 13, lat: number | null, lng: number | null): ActivityPoint {
  return {
    id,
    rwId,
    slug: id,
    name: id,
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

describe('buildGeoMarkers', () => {
  it('pins the located RW centres first, then the located points, and nothing without both coordinates', () => {
    const markers = buildGeoMarkers(
      [point('bank-sampah', 5, -6.98, 110.38), point('tanpa-koordinat', 5, -6.98, null)],
      [unit(5, -6.97, 110.37), unit(13, null, 110.4)],
    );
    expect(markers.map((marker) => [marker.id, marker.kind])).toEqual([
      ['rw-5', 'rw'],
      ['bank-sampah', 'point'],
    ]);
  });

  it('gives a point its type label, its RW badge and a route to its own coordinates', () => {
    const [marker] = buildGeoMarkers(
      [point('bank-sampah', 5, -6.98, 110.38)],
      [unit(5, null, null)],
    );
    expect(marker).toMatchObject({
      detail: 'Bank Sampah',
      rw: { id: 5, label: 'RW 05', accentKey: 'leaf' },
      routeUrl: 'https://www.google.com/maps/dir/?api=1&destination=-6.98%2C110.38',
    });
  });

  it('gives an RW centre no detail', () => {
    const [marker] = buildGeoMarkers([], [unit(13, -6.96, 110.39)]);
    expect(marker).toMatchObject({ kind: 'rw', name: 'RW 13 Uji', detail: null });
  });
});

describe('mapCentreOf', () => {
  it('is null with no marker', () => {
    expect(mapCentreOf([])).toBeNull();
  });

  it('centres on the RW centres when the kelurahan has set them', () => {
    const markers = buildGeoMarkers(
      [point('jauh', 5, -8, 112)],
      [unit(5, -6, 110), unit(13, -7, 111)],
    );
    expect(mapCentreOf(markers)).toEqual({ lat: -6.5, lng: 110.5 });
  });

  it('falls back to the points when no RW centre is set', () => {
    const markers = buildGeoMarkers(
      [point('a', 5, -6, 110), point('b', 13, -8, 112)],
      [unit(5, null, null), unit(13, null, null)],
    );
    expect(mapCentreOf(markers)).toEqual({ lat: -7, lng: 111 });
  });
});
