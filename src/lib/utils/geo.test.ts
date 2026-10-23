import { describe, expect, it } from 'vitest';

import {
  geoCentroid,
  googleMapsDirectionsUrl,
  googleMapsEmbedUrl,
  googleMapsPlaceUrl,
  locatedPoints,
} from '@/lib/utils/geo';

describe('locatedPoints', () => {
  it('keeps only the rows with both coordinates', () => {
    const rows = [
      { id: 'a', lat: -6.98, lng: 110.38 },
      { id: 'b', lat: -6.98, lng: null },
      { id: 'c', lat: null, lng: 110.38 },
      { id: 'd', lat: null, lng: null },
    ];
    expect(locatedPoints(rows).map((row) => row.id)).toEqual(['a']);
  });
});

describe('geoCentroid', () => {
  it('is null without a point', () => {
    expect(geoCentroid([])).toBeNull();
  });

  it('is the mean of the points', () => {
    expect(
      geoCentroid([
        { lat: -6, lng: 110 },
        { lat: -8, lng: 112 },
      ]),
    ).toEqual({ lat: -7, lng: 111 });
  });
});

describe('Google Maps addresses', () => {
  it('routes to the office address as written, encoded', () => {
    expect(googleMapsDirectionsUrl('Jl. Contoh No. 1, Semarang')).toBe(
      'https://www.google.com/maps/dir/?api=1&destination=Jl.%20Contoh%20No.%201%2C%20Semarang',
    );
  });

  it('routes to a point as lat,lng', () => {
    expect(googleMapsDirectionsUrl({ lat: -6.98, lng: 110.38 })).toBe(
      'https://www.google.com/maps/dir/?api=1&destination=-6.98%2C110.38',
    );
  });

  it('opens a point on Google Maps for hasMap', () => {
    expect(googleMapsPlaceUrl({ lat: -6.98, lng: 110.38 })).toBe(
      'https://www.google.com/maps/search/?api=1&query=-6.98%2C110.38',
    );
  });

  it('embeds only from the path the CSP allows, centred on the point', () => {
    const url = googleMapsEmbedUrl({ lat: -6.98, lng: 110.38 });
    expect(url.startsWith('https://www.google.com/maps/embed?pb=')).toBe(true);
    expect(url).toContain('!2d110.38!3d-6.98!');
    expect(url).not.toContain('key=');
  });
});
