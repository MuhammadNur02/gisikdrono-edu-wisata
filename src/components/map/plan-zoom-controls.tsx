'use client';

import { Minus, Plus, RotateCcw, type LucideIcon } from 'lucide-react';
import { useReducedMotion } from 'motion/react';
import { useControls } from 'react-zoom-pan-pinch';

import { Button } from '@/components/ui/button';
import { mapCopy } from '@/lib/copy/map';

// react-zoom-pan-pinch takes the animation in milliseconds; 0 moves at once for a visitor who asked for less
// motion (docs/StyleGuide.md §7.4). undefined keeps the library's own 300 ms, the base duration of §7.2.
const INSTANT_MS = 0;

function ZoomButton({
  label,
  icon,
  onPress,
}: {
  label: string;
  icon: LucideIcon;
  onPress: () => void;
}) {
  const Icon = icon;
  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      className="size-11 bg-background"
      aria-label={label}
      onClick={onPress}
    >
      <Icon aria-hidden />
    </Button>
  );
}

// The +, − and reset buttons of docs/StyleGuide.md §5.13, 44 px each, inside the TransformWrapper so they reach
// its controls.
export function PlanZoomControls() {
  const { zoomIn, zoomOut, resetTransform } = useControls();
  const animationMs = useReducedMotion() === true ? INSTANT_MS : undefined;
  return (
    <div className="absolute top-3 right-3 z-10 flex flex-col gap-2">
      <ZoomButton
        label={mapCopy.zoomIn}
        icon={Plus}
        onPress={() => {
          void zoomIn(undefined, animationMs);
        }}
      />
      <ZoomButton
        label={mapCopy.zoomOut}
        icon={Minus}
        onPress={() => {
          void zoomOut(undefined, animationMs);
        }}
      />
      <ZoomButton
        label={mapCopy.resetView}
        icon={RotateCcw}
        onPress={() => {
          void resetTransform(animationMs);
        }}
      />
    </div>
  );
}
