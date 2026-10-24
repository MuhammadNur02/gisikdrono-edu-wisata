import { describe, expect, it } from 'vitest';

import {
  closeRing,
  isInsidePolygon,
  isInsideRing,
  orientRing,
  pointOnSurface,
  ringArea,
  ringAreaSquareMetres,
  ringCentroid,
  roundCoordinate,
  roundPosition,
  simplifyRing,
  type Ring,
} from '@/lib/utils/geo-polygon';

const SQUARE: Ring = [
  [0, 0],
  [4, 0],
  [4, 4],
  [0, 4],
  [0, 0],
];

// A U opening to the north: its centroid falls in the gap between the arms, outside the area.
const U_SHAPE: Ring = [
  [0, 0],
  [6, 0],
  [6, 6],
  [4, 6],
  [4, 2],
  [2, 2],
  [2, 6],
  [0, 6],
  [0, 0],
];

describe('rounding', () => {
  it('keeps six decimals by default', () => {
    expect(roundCoordinate(110.38972051234)).toBe(110.389721);
    expect(roundPosition([110.3897205, -6.98768649])).toEqual([110.389721, -6.987686]);
  });

  it('takes another precision', () => {
    expect(roundCoordinate(1.23456, 2)).toBe(1.23);
  });
});

describe('closeRing', () => {
  it('drops repeated positions and closes the ring', () => {
    expect(
      closeRing([
        [0, 0],
        [1, 0],
        [1, 0],
        [1, 1],
      ]),
    ).toEqual([
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 0],
    ]);
  });

  it('leaves a closed ring closed and an empty one empty', () => {
    expect(closeRing(SQUARE)).toEqual(SQUARE);
    expect(closeRing([])).toEqual([]);
  });
});

describe('simplifyRing', () => {
  it('drops a position that lies on a straight edge', () => {
    const withMidpoint: Ring = [
      [0, 0],
      [2, 0.0000001],
      [4, 0],
      [4, 4],
      [0, 4],
      [0, 0],
    ];
    expect(simplifyRing(withMidpoint, 0.001)).toEqual(SQUARE);
  });

  it('keeps a corner that is farther than the tolerance', () => {
    const notched: Ring = [
      [0, 0],
      [2, 1],
      [4, 0],
      [4, 4],
      [0, 4],
      [0, 0],
    ];
    expect(simplifyRing(notched, 0.001)).toHaveLength(notched.length);
  });

  it('keeps a triangle and a ring that would collapse as they were', () => {
    const triangle: Ring = [
      [0, 0],
      [1, 0],
      [0, 1],
      [0, 0],
    ];
    expect(simplifyRing(triangle, 10)).toEqual(triangle);
    expect(simplifyRing(SQUARE, 10)).toEqual(SQUARE);
  });
});

describe('isInsideRing and isInsidePolygon', () => {
  it('tells inside from outside', () => {
    expect(isInsideRing([2, 2], SQUARE)).toBe(true);
    expect(isInsideRing([5, 2], SQUARE)).toBe(false);
  });

  it('treats a hole as outside', () => {
    const hole: Ring = [
      [1, 1],
      [3, 1],
      [3, 3],
      [1, 3],
      [1, 1],
    ];
    expect(isInsidePolygon([2, 2], [SQUARE, hole])).toBe(false);
    expect(isInsidePolygon([0.5, 0.5], [SQUARE, hole])).toBe(true);
    expect(isInsidePolygon([2, 2], [])).toBe(false);
  });
});

describe('ringArea and ringCentroid', () => {
  it('measures a square either way round', () => {
    expect(ringArea(SQUARE)).toBe(16);
    expect(ringArea([...SQUARE].reverse())).toBe(16);
    expect(ringCentroid(SQUARE)).toEqual([2, 2]);
  });

  it('has no centroid for a ring without area', () => {
    expect(
      ringCentroid([
        [0, 0],
        [1, 1],
        [0, 0],
      ]),
    ).toBeNull();
  });
});

describe('pointOnSurface', () => {
  it('is the centroid of a compact area', () => {
    expect(pointOnSurface([[SQUARE]])).toEqual([2, 2]);
  });

  it('falls inside a U whose centroid lies in the gap', () => {
    const centroid = ringCentroid(U_SHAPE);
    expect(centroid && isInsideRing(centroid, U_SHAPE)).toBe(false);
    const point = pointOnSurface([[U_SHAPE]]);
    expect(point !== null && isInsideRing(point, U_SHAPE)).toBe(true);
  });

  it('uses the largest part of a multipolygon', () => {
    const small: Ring = [
      [10, 10],
      [11, 10],
      [11, 11],
      [10, 11],
      [10, 10],
    ];
    expect(pointOnSurface([[small], [SQUARE]])).toEqual([2, 2]);
  });

  it('is NULL without an area', () => {
    expect(pointOnSurface([])).toBeNull();
    expect(
      pointOnSurface([
        [
          [
            [0, 0],
            [1, 1],
            [0, 0],
          ],
        ],
      ]),
    ).toBeNull();
  });
});

describe('orientRing', () => {
  const clockwise = [...SQUARE].reverse();

  it('turns an outer ring counterclockwise and a hole clockwise', () => {
    expect(orientRing(clockwise, 'counterclockwise')).toEqual(SQUARE);
    expect(orientRing(SQUARE, 'counterclockwise')).toBe(SQUARE);
    expect(orientRing(SQUARE, 'clockwise')).toEqual(clockwise);
    expect(orientRing(clockwise, 'clockwise')).toBe(clockwise);
  });

  it('leaves a ring without area as it is', () => {
    const flat: Ring = [
      [0, 0],
      [1, 1],
      [0, 0],
    ];
    expect(orientRing(flat, 'clockwise')).toBe(flat);
  });
});

describe('ringAreaSquareMetres', () => {
  it('measures a square of 0.001 degree near Gisikdrono at about 12 200 m²', () => {
    const square: Ring = [
      [110.38, -6.99],
      [110.381, -6.99],
      [110.381, -6.989],
      [110.38, -6.989],
      [110.38, -6.99],
    ];
    expect(ringAreaSquareMetres(square)).toBeGreaterThan(12_000);
    expect(ringAreaSquareMetres(square)).toBeLessThan(12_400);
    expect(ringAreaSquareMetres([])).toBe(0);
  });
});
