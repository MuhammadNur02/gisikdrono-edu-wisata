'use client';

import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { TransformComponent, TransformWrapper } from 'react-zoom-pan-pinch';

import { HotspotLayer } from '@/components/map/hotspot-layer';
import { PlanZoomControls } from '@/components/map/plan-zoom-controls';
import {
  PLAN_ACTIVE_CLASS,
  PLAN_ASPECT_CLASS,
  PLAN_HOTSPOT_CLASS,
  PLAN_MAX_SCALE,
  PLAN_MIN_SCALE,
} from '@/config/map';
import { mapCopy } from '@/lib/copy/map';
import { cn } from '@/lib/utils/cn';
import { placedHotspots } from '@/lib/utils/site-plan';
import type { ActivityPoint } from '@/types/activity-point';
import type { RwBadge } from '@/types/rw-unit';

import Denah from '../../../public/map/denah.svg';

// The whole plan stays the zoomable content, so the wrapper and the content take the full width the library
// would otherwise shrink to the drawing.
const FULL_WIDTH = { width: '100%' } as const;

export interface SiteMapSvgProps {
  points: readonly ActivityPoint[];
  units: readonly RwBadge[];
}

// While a hotspot is open, the plan element it is bound to (activity_points.svg_hotspot_id) carries the active
// class (docs/StyleGuide.md §5.13). The id is CMS text, so it is escaped before it becomes a selector.
function usePlanHighlight(planRef: RefObject<HTMLDivElement | null>, hotspotId: string | null) {
  useEffect(() => {
    if (hotspotId === null) return;
    const element = planRef.current?.querySelector(`#${CSS.escape(hotspotId)}`);
    if (!element) return;
    element.classList.add(PLAN_ACTIVE_CLASS);
    return () => {
      element.classList.remove(PLAN_ACTIVE_CLASS);
    };
  }, [planRef, hotspotId]);
}

// The wheel zooms only with Ctrl or Meta held, as a map does, so the page keeps scrolling over the plan; pinch and
// the buttons zoom as before (review of PR #29).
const WHEEL_OPTIONS = { activationKeys: ['Control', 'Meta'] };

// Which hotspot is open, and whether the plan is at its smallest, when a drag has nothing to pan and would only
// trap the page's scroll on a phone.
function usePlanState(points: readonly ActivityPoint[]) {
  const hotspots = useMemo(() => placedHotspots(points), [points]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [isZoomedOut, setIsZoomedOut] = useState(true);
  const planRef = useRef<HTMLDivElement>(null);
  const activeHotspot = hotspots.find((hotspot) => hotspot.id === activeId) ?? null;
  usePlanHighlight(planRef, activeHotspot?.svgHotspotId ?? null);
  return {
    hotspots,
    activeId,
    setActiveId,
    planRef,
    isZoomedOut,
    closePopover: () => {
      setActiveId(null);
    },
    onTransform: (_: unknown, state: { scale: number }) => {
      setIsZoomedOut(state.scale <= PLAN_MIN_SCALE);
    },
  };
}

export function SiteMapSvg({ points, units }: SiteMapSvgProps) {
  const plan = usePlanState(points);
  const { hotspots, activeId, setActiveId, planRef, closePopover } = plan;
  return (
    <div className="relative overflow-hidden rounded-xl border border-border bg-muted">
      <TransformWrapper
        minScale={PLAN_MIN_SCALE}
        maxScale={PLAN_MAX_SCALE}
        doubleClick={{ disabled: true }}
        wheel={WHEEL_OPTIONS}
        // A press on a hotspot is a click, never the start of a pan, so the popover opens once and keeps focus.
        panning={{
          velocityDisabled: true,
          excluded: [PLAN_HOTSPOT_CLASS],
          disabled: plan.isZoomedOut,
        }}
        onTransform={plan.onTransform}
        onPanningStart={closePopover}
        onZoomStart={closePopover}
      >
        <PlanZoomControls />
        <TransformComponent wrapperStyle={FULL_WIDTH} contentStyle={FULL_WIDTH}>
          <div
            ref={planRef}
            role="group"
            aria-label={mapCopy.planLabel}
            className={cn('relative w-full', PLAN_ASPECT_CLASS)}
          >
            <Denah aria-hidden className="block size-full" />
            <HotspotLayer
              hotspots={hotspots}
              units={units}
              activeId={activeId}
              onSelect={setActiveId}
            />
          </div>
        </TransformComponent>
      </TransformWrapper>
    </div>
  );
}
