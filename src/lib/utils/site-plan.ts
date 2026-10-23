import type { ActivityPoint } from '@/types/activity-point';

// The hotspots of the site plan (docs/StyleGuide.md §5.13): which points stand on it and in what order the keyboard
// reaches them.

export type PlacedActivityPoint = ActivityPoint & { mapX: number; mapY: number };

// Hotspots are read row by row, top-left to bottom-right; points within one band of the plan's height count as
// one row, so two hotspots side by side are reached in order even when one sits a little lower.
const ROW_BAND_PERCENT = 10;

function rowOf(point: PlacedActivityPoint): number {
  return Math.floor(point.mapY / ROW_BAND_PERCENT);
}

// The points with a position on the plan, in keyboard order. A point without one is listed, never pinned.
export function placedHotspots(points: readonly ActivityPoint[]): PlacedActivityPoint[] {
  return points
    .filter((point): point is PlacedActivityPoint => point.mapX !== null && point.mapY !== null)
    .sort((a, b) => rowOf(a) - rowOf(b) || a.mapX - b.mapX || a.mapY - b.mapY);
}
