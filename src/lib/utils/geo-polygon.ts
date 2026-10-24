// Plane geometry on GeoJSON positions for the RW area map (docs/PRD.md FR-PUB-18): rounding and light
// simplification for scripts/convert-rw-kml.ts, and a point inside an RW area for its label, its route link and
// the estimated activity points of scripts/seed-demo-content.sql. Across one kelurahan (about 2 km) treating
// degrees as plane coordinates is accurate enough. Pure, so the converter, the page and the map share it.

// [lng, lat], the GeoJSON order.
export type Position = readonly [number, number];
// A closed ring: the first and last positions are equal.
export type Ring = readonly Position[];
// The outer ring first, then any holes.
export type PolygonRings = readonly Ring[];

// GeoJSON's recommendation: six decimals are about 10 cm, finer than any drawn boundary.
export const COORDINATE_DECIMALS = 6;
// The fewest positions a closed ring can have (a triangle plus its closing position).
const MIN_RING_POSITIONS = 4;
const HALF = 0.5;
const DECIMAL_BASE = 10;
// A line needs its two end positions; anything shorter has nothing to simplify.
const LINE_ENDS = 2;
// The centroid of a polygon divides the summed cross products by six times its area.
const CENTROID_DIVISOR = 6;
// The scan line enters and leaves the area in pairs of crossings.
const CROSSING_PAIR = 2;

export function roundCoordinate(value: number, decimals: number = COORDINATE_DECIMALS): number {
  const factor = DECIMAL_BASE ** decimals;
  return Math.round(value * factor) / factor;
}

export function roundPosition(
  position: Position,
  decimals: number = COORDINATE_DECIMALS,
): Position {
  return [roundCoordinate(position[0], decimals), roundCoordinate(position[1], decimals)];
}

// How far `point` lies from the segment between `start` and `end`.
function distanceToSegment(point: Position, start: Position, end: Position): number {
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  const lengthSquared = dx * dx + dy * dy;
  const t =
    lengthSquared === 0
      ? 0
      : Math.max(
          0,
          Math.min(1, ((point[0] - start[0]) * dx + (point[1] - start[1]) * dy) / lengthSquared),
        );
  return Math.hypot(point[0] - (start[0] + t * dx), point[1] - (start[1] + t * dy));
}

// Douglas-Peucker on an open line: the positions of `line` that keep it within `tolerance` of the original.
function simplifyLine(line: readonly Position[], tolerance: number): Position[] {
  const first = line[0];
  const last = line[line.length - 1];
  if (first === undefined || last === undefined || line.length <= LINE_ENDS) return [...line];
  let farthestIndex = 0;
  let farthestDistance = 0;
  line.forEach((point, index) => {
    const distance = distanceToSegment(point, first, last);
    if (distance > farthestDistance) {
      farthestDistance = distance;
      farthestIndex = index;
    }
  });
  if (farthestDistance <= tolerance) return [first, last];
  const head = simplifyLine(line.slice(0, farthestIndex + 1), tolerance);
  return [...head.slice(0, -1), ...simplifyLine(line.slice(farthestIndex), tolerance)];
}

function samePosition(a: Position, b: Position): boolean {
  return a[0] === b[0] && a[1] === b[1];
}

// A ring with repeated positions dropped and its closing position restored.
export function closeRing(positions: readonly Position[]): Position[] {
  const distinct = positions.filter((position, index) => {
    const previous = positions[index - 1];
    return previous === undefined || !samePosition(previous, position);
  });
  const [first] = distinct;
  const last = distinct[distinct.length - 1];
  if (first === undefined || last === undefined) return [];
  return samePosition(first, last) ? distinct : [...distinct, first];
}

// Light simplification of a closed ring; a ring that would lose its shape is kept as it was.
export function simplifyRing(ring: Ring, tolerance: number): Ring {
  const closed = closeRing(ring);
  if (closed.length <= MIN_RING_POSITIONS) return closed;
  const simplified = closeRing(simplifyLine(closed, tolerance));
  return simplified.length >= MIN_RING_POSITIONS ? simplified : closed;
}

// Ray casting: whether `point` lies inside the closed `ring`.
export function isInsideRing(point: Position, ring: Ring): boolean {
  let isInside = false;
  for (
    let index = 0, previous = ring.length - 1;
    index < ring.length;
    previous = index, index += 1
  ) {
    const a = ring[index];
    const b = ring[previous];
    if (a === undefined || b === undefined) continue;
    const crosses =
      a[1] > point[1] !== b[1] > point[1] &&
      point[0] < ((b[0] - a[0]) * (point[1] - a[1])) / (b[1] - a[1]) + a[0];
    if (crosses) isInside = !isInside;
  }
  return isInside;
}

// Inside the outer ring and outside every hole.
export function isInsidePolygon(point: Position, polygon: PolygonRings): boolean {
  const [outer, ...holes] = polygon;
  if (outer === undefined || !isInsideRing(point, outer)) return false;
  return !holes.some((hole) => isInsideRing(point, hole));
}

function signedArea(ring: Ring): number {
  let doubled = 0;
  for (let index = 0; index < ring.length - 1; index += 1) {
    const a = ring[index];
    const b = ring[index + 1];
    if (a !== undefined && b !== undefined) doubled += a[0] * b[1] - b[0] * a[1];
  }
  return doubled * HALF;
}

export function ringArea(ring: Ring): number {
  return Math.abs(signedArea(ring));
}

// The area centroid of a closed ring; NULL for a ring without area.
export function ringCentroid(ring: Ring): Position | null {
  const area = signedArea(ring);
  if (area === 0) return null;
  let sumX = 0;
  let sumY = 0;
  for (let index = 0; index < ring.length - 1; index += 1) {
    const a = ring[index];
    const b = ring[index + 1];
    if (a === undefined || b === undefined) continue;
    const cross = a[0] * b[1] - b[0] * a[1];
    sumX += (a[0] + b[0]) * cross;
    sumY += (a[1] + b[1]) * cross;
  }
  const divisor = CENTROID_DIVISOR * area;
  return [sumX / divisor, sumY / divisor];
}

// Where the horizontal line at `latitude` crosses the polygon's edges, west to east.
function crossingsAt(latitude: number, polygon: PolygonRings): number[] {
  const crossings: number[] = [];
  for (const ring of polygon) {
    for (let index = 0; index < ring.length - 1; index += 1) {
      const a = ring[index];
      const b = ring[index + 1];
      if (a === undefined || b === undefined || a[1] > latitude === b[1] > latitude) continue;
      crossings.push(a[0] + ((latitude - a[1]) * (b[0] - a[0])) / (b[1] - a[1]));
    }
  }
  return crossings.sort((west, east) => west - east);
}

// The middle of the widest stretch of the line at `latitude` that lies inside the polygon.
function widestInteriorMidpoint(latitude: number, polygon: PolygonRings): Position | null {
  const crossings = crossingsAt(latitude, polygon);
  let best: Position | null = null;
  let bestWidth = 0;
  for (let index = 0; index + 1 < crossings.length; index += CROSSING_PAIR) {
    const west = crossings[index];
    const east = crossings[index + 1];
    if (west === undefined || east === undefined || east - west <= bestWidth) continue;
    bestWidth = east - west;
    best = [(west + east) * HALF, latitude];
  }
  return best;
}

function latitudeRange(ring: Ring): { south: number; north: number } {
  const latitudes = ring.map((position) => position[1]);
  return { south: Math.min(...latitudes), north: Math.max(...latitudes) };
}

// A point guaranteed inside the largest part of a (multi)polygon: its centroid when that falls inside, as it does
// for a compact RW, otherwise the middle of the widest interior stretch through the centroid's latitude (or the
// middle latitude), as JTS's interior point does for a crescent or an L-shaped area. NULL without any area.
export function pointOnSurface(polygons: readonly PolygonRings[]): Position | null {
  const largest = [...polygons].sort((a, b) => ringArea(b[0] ?? []) - ringArea(a[0] ?? []))[0];
  const outer = largest?.[0];
  if (largest === undefined || outer === undefined) return null;
  const centroid = ringCentroid(outer);
  if (centroid === null) return null;
  if (isInsidePolygon(centroid, largest)) return centroid;
  const { south, north } = latitudeRange(outer);
  return (
    widestInteriorMidpoint(centroid[1], largest) ??
    widestInteriorMidpoint((south + north) * HALF, largest)
  );
}
