import { ExternalLink } from 'lucide-react';

import { RwEyebrow } from '@/components/layout/rw-eyebrow';
import { ACTIVITY_POINT_TYPE } from '@/config/status';
import { mapCopy } from '@/lib/copy/map';
import { googleMapsDirectionsUrl } from '@/lib/utils/geo';
import type { ActivityPoint } from '@/types/activity-point';
import type { RwUnitSummary } from '@/types/rw-unit';

export interface RwPointsListProps {
  points: readonly ActivityPoint[];
  // The RWs online, in their order; a point of an RW that is not among them is not listed.
  units: readonly RwUnitSummary[];
}

// The Leaflet markers answer the mouse only, so a located point carries its route link here as well, a 44 px
// target that names the point for a screen reader (review of PR #29).
function PointRow({ point }: { point: ActivityPoint }) {
  const Icon = ACTIVITY_POINT_TYPE[point.pointType].icon;
  const routeUrl =
    point.lat !== null && point.lng !== null
      ? googleMapsDirectionsUrl({ lat: point.lat, lng: point.lng })
      : null;
  return (
    <li className="flex min-h-11 items-center gap-2 text-body">
      <Icon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1">{point.name}</span>
      {routeUrl ? (
        <a
          href={routeUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={mapCopy.routeTo(point.name)}
          className="inline-flex min-h-11 shrink-0 items-center gap-1 rounded-lg px-2 text-body-sm text-primary-text underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <ExternalLink aria-hidden className="size-4" />
          {mapCopy.route}
        </a>
      ) : null}
    </li>
  );
}

function RwPoints({ unit, points }: { unit: RwUnitSummary; points: readonly ActivityPoint[] }) {
  return (
    <div className="space-y-3">
      <RwEyebrow rw={unit} withName />
      <ul className="space-y-1">
        {points.map((point) => (
          <PointRow key={point.id} point={point} />
        ))}
      </ul>
    </div>
  );
}

// The list view of docs/StyleGuide.md §5.13: the points the plan pins, RW by RW, for a screen reader and for a
// small screen where the plan is hard to read.
export function RwPointsList({ points, units }: RwPointsListProps) {
  const pointsByRw = units
    .map((unit) => ({ unit, points: points.filter((point) => point.rwId === unit.id) }))
    .filter((group) => group.points.length > 0);
  if (pointsByRw.length === 0) return null;
  return (
    <div className="grid gap-8 md:grid-cols-3">
      {pointsByRw.map((group) => (
        <RwPoints key={group.unit.id} unit={group.unit} points={group.points} />
      ))}
    </div>
  );
}
