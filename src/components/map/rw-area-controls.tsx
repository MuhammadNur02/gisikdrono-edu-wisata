'use client';

import type { FitBoundsOptions, LatLngBounds, Map as LeafletMapInstance } from 'leaflet';
import { LocateFixed, Minus, Plus, type LucideIcon } from 'lucide-react';

import { mapCopy } from '@/lib/copy/map';

function ControlButton({
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
    <button
      type="button"
      aria-label={label}
      onClick={onPress}
      className="flex size-11 items-center justify-center text-foreground transition-colors hover:bg-muted"
    >
      <Icon aria-hidden className="size-4.5" />
    </button>
  );
}

// DESIGN-SPEC §3.9: 44 px buttons stacked in one white card at the top right, over the map element, whose `isolate`
// keeps Leaflet's panes from covering them; the third shows the whole kelurahan again.
export interface MapControlsProps {
  map: LeafletMapInstance;
  prefersReducedMotion: boolean;
  // What the third button frames: the whole kelurahan.
  resetBounds: LatLngBounds;
  fitOptions: FitBoundsOptions;
}

export function MapControls({
  map,
  prefersReducedMotion,
  resetBounds,
  fitOptions,
}: MapControlsProps) {
  return (
    <div className="absolute top-4 right-4 z-10 flex flex-col divide-y divide-border overflow-hidden rounded-md bg-card shadow-sm">
      <ControlButton label={mapCopy.geoZoomIn} icon={Plus} onPress={() => map.zoomIn()} />
      <ControlButton label={mapCopy.geoZoomOut} icon={Minus} onPress={() => map.zoomOut()} />
      <ControlButton
        label={mapCopy.geoReset}
        icon={LocateFixed}
        onPress={() =>
          map.fitBounds(resetBounds, { ...fitOptions, animate: !prefersReducedMotion })
        }
      />
    </div>
  );
}
