import { describe, expect, it } from 'vitest';

import { placedHotspots } from '@/lib/utils/site-plan';
import type { ActivityPoint } from '@/types/activity-point';

function point(id: string, mapX: number | null, mapY: number | null): ActivityPoint {
  return {
    id,
    rwId: 5,
    slug: id,
    name: id,
    pointType: 'other',
    shortDescription: null,
    bodyMd: null,
    image: null,
    mapX,
    mapY,
    svgHotspotId: null,
    lat: null,
    lng: null,
  };
}

describe('placedHotspots', () => {
  it('leaves out a point without a full position', () => {
    const hotspots = placedHotspots([point('a', 10, 10), point('b', 10, null), point('c', null, 10)]);
    expect(hotspots.map((hotspot) => hotspot.id)).toEqual(['a']);
  });

  it('reads the plan row by row, left to right', () => {
    const hotspots = placedHotspots([
      point('bottom-left', 5, 80),
      point('top-right', 90, 12),
      point('top-left-lower', 10, 18),
      point('top-left', 20, 11),
    ]);
    expect(hotspots.map((hotspot) => hotspot.id)).toEqual([
      'top-left-lower',
      'top-left',
      'top-right',
      'bottom-left',
    ]);
  });
});
