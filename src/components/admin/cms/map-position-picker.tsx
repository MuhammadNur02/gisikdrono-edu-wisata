'use client';

import { MapPin } from 'lucide-react';

import { MAP_PERCENT_MAX, MAP_PERCENT_ROUNDING } from '@/config/cms';
import { PLAN_ASPECT_CLASS } from '@/config/map';
import { copy } from '@/lib/copy/id';
import { cn } from '@/lib/utils/cn';

import Denah from '../../../../public/map/denah.svg';

export interface MapPositionPickerProps {
  x: number | null;
  y: number | null;
  onPick: (x: number, y: number) => void;
}

function percentOf(offset: number, size: number): number {
  const percent = (offset / size) * MAP_PERCENT_MAX;
  return (
    Math.round(Math.min(Math.max(percent, 0), MAP_PERCENT_MAX) * MAP_PERCENT_ROUNDING) /
    MAP_PERCENT_ROUNDING
  );
}

// docs/StyleGuide.md §8.3: map_x / map_y are percentages of the site plan's width and height. The plan itself lies
// under the pin, so an officer places a point on the spot the visitor will see; a click puts the point there, and
// the two number fields beside it do the same from the keyboard.
export function MapPositionPicker({ x, y, onPick }: MapPositionPickerProps) {
  return (
    <button
      type="button"
      aria-label={copy.cms.points.positionPicker}
      className={cn(
        'relative w-full overflow-hidden rounded-xl border border-input bg-muted/40 outline-none focus-visible:ring-2 focus-visible:ring-ring',
        PLAN_ASPECT_CLASS,
      )}
      onClick={(event) => {
        const box = event.currentTarget.getBoundingClientRect();
        onPick(
          percentOf(event.clientX - box.left, box.width),
          percentOf(event.clientY - box.top, box.height),
        );
      }}
    >
      <Denah aria-hidden className="pointer-events-none absolute inset-0 size-full" />
      {x !== null && y !== null ? (
        <MapPin
          aria-hidden
          className="absolute size-6 -translate-x-1/2 -translate-y-full text-primary"
          // The point's own position, from the data rather than from a design value.
          style={{ left: `${String(x)}%`, top: `${String(y)}%` }}
        />
      ) : null}
    </button>
  );
}
