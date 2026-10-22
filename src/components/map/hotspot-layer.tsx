'use client';

import { m } from 'motion/react';
import { useState } from 'react';
import { useTransformEffect } from 'react-zoom-pan-pinch';

import { HotspotPopover } from '@/components/map/hotspot-popover';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { HOTSPOT_ACTIVE_SCALE } from '@/config/map';
import { rwAccentClasses } from '@/config/rw';
import { ACTIVITY_POINT_TYPE } from '@/config/status';
import { mapCopy } from '@/lib/copy/map';
import { spring } from '@/lib/motion/transitions';
import { cn } from '@/lib/utils/cn';
import { rwBadgeFor } from '@/lib/utils/rw-units';
import type { PlacedActivityPoint } from '@/lib/utils/site-plan';
import type { RwBadge } from '@/types/rw-unit';

// The popover keeps this far from the window's edges, the phone gutter of docs/StyleGuide.md §4.1.
const POPOVER_COLLISION_PADDING_PX = 16;

interface HotspotMarkerProps {
  point: PlacedActivityPoint;
  rw: RwBadge;
  isActive: boolean;
}

// The 32 px circle of docs/StyleGuide.md §5.13 in the RW's fill pair, with the name on hover or focus; the popover
// carries the name once open.
function HotspotMarker({ point, rw, isActive }: HotspotMarkerProps) {
  const Icon = ACTIVITY_POINT_TYPE[point.pointType].icon;
  return (
    <>
      <span
        className={cn(
          'flex size-8 items-center justify-center rounded-full shadow-card ring-4 ring-background',
          rwAccentClasses(rw.accentKey).fill,
        )}
      >
        <Icon aria-hidden className="size-4" strokeWidth={2} />
      </span>
      {isActive ? null : (
        <span className="pointer-events-none absolute top-full left-1/2 mt-1 -translate-x-1/2 rounded-md bg-popover px-2 py-0.5 text-caption font-medium whitespace-nowrap text-popover-foreground opacity-0 shadow-card transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 motion-reduce:transition-none">
          {point.name}
        </span>
      )}
    </>
  );
}

interface HotspotProps extends Omit<HotspotMarkerProps, 'rw'> {
  units: readonly RwBadge[];
  // The plan's current zoom; the hotspot is scaled back by it so it keeps its size while the plan grows.
  zoomScale: number;
  onSelect: (id: string | null) => void;
}

// A 44 px target around the circle; the position is the point's own data (map_x / map_y). The trigger stays a
// motion button here so Radix can hand it its ref and the open state.
function Hotspot({ point, units, isActive, zoomScale, onSelect }: HotspotProps) {
  const rw = rwBadgeFor(point.rwId, units);
  return (
    <Popover
      open={isActive}
      onOpenChange={(open) => {
        onSelect(open ? point.id : null);
      }}
    >
      <PopoverTrigger asChild>
        <m.button
          type="button"
          aria-label={mapCopy.hotspot(point.name, rw.label)}
          className="group absolute flex size-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          style={{ left: `${String(point.mapX)}%`, top: `${String(point.mapY)}%` }}
          initial={false}
          animate={{ scale: (isActive ? HOTSPOT_ACTIVE_SCALE : 1) / zoomScale }}
          transition={spring.snappy}
        >
          <HotspotMarker point={point} rw={rw} isActive={isActive} />
        </m.button>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        collisionPadding={POPOVER_COLLISION_PADDING_PX}
        className="overflow-hidden p-0"
        aria-label={point.name}
      >
        <HotspotPopover
          point={point}
          rw={rw}
          hasGallery={units.some((unit) => unit.id === point.rwId)}
        />
      </PopoverContent>
    </Popover>
  );
}

export interface HotspotLayerProps {
  hotspots: readonly PlacedActivityPoint[];
  units: readonly RwBadge[];
  activeId: string | null;
  onSelect: (id: string | null) => void;
}

// The hotspots over the plan, in keyboard order (src/lib/utils/site-plan.ts). Rendered inside the zoomable
// content so each stays on its spot; the zoom is read back to keep the circles at one size.
export function HotspotLayer({ hotspots, units, activeId, onSelect }: HotspotLayerProps) {
  const [zoomScale, setZoomScale] = useState(1);
  useTransformEffect(({ state }) => {
    setZoomScale(state.scale);
  });
  return (
    <>
      {hotspots.map((point) => (
        <Hotspot
          key={point.id}
          point={point}
          units={units}
          isActive={activeId === point.id}
          zoomScale={zoomScale}
          onSelect={onSelect}
        />
      ))}
    </>
  );
}
