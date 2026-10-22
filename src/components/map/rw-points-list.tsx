import { RwEyebrow } from '@/components/layout/rw-eyebrow';
import { ACTIVITY_POINT_TYPE } from '@/config/status';
import type { ActivityPoint } from '@/types/activity-point';
import type { RwUnitSummary } from '@/types/rw-unit';

export interface RwPointsListProps {
  points: readonly ActivityPoint[];
  // The RWs online, in their order; a point of an RW that is not among them is not listed.
  units: readonly RwUnitSummary[];
}

function RwPoints({ unit, points }: { unit: RwUnitSummary; points: readonly ActivityPoint[] }) {
  return (
    <div className="space-y-3">
      <RwEyebrow rw={unit} withName />
      <ul className="space-y-2">
        {points.map((point) => {
          const Icon = ACTIVITY_POINT_TYPE[point.pointType].icon;
          return (
            <li key={point.id} className="flex items-center gap-2 text-body">
              <Icon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
              {point.name}
            </li>
          );
        })}
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
