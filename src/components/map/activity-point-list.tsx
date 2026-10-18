import { Photo } from '@/components/marketing/photo';
import { IMAGE_SIZES } from '@/config/images';
import { ACTIVITY_POINT_TYPE } from '@/config/status';
import type { ActivityPoint } from '@/types/activity-point';

export interface ActivityPointListProps {
  points: readonly ActivityPoint[];
}

function ActivityPointItem({ point }: { point: ActivityPoint }) {
  const type = ACTIVITY_POINT_TYPE[point.pointType];
  const Icon = type.icon;
  return (
    <li className="flex flex-col gap-4 rounded-xl border border-border bg-card p-5 md:p-6 dark:border-white/5">
      {point.image ? (
        <Photo
          image={point.image}
          caption={point.name}
          sizes={IMAGE_SIZES.card}
          aspectClassName="aspect-4/3"
        />
      ) : null}
      <div className="flex items-start gap-3">
        <Icon
          aria-hidden
          className="size-10 shrink-0 rounded-lg bg-secondary p-2.5 text-secondary-foreground"
        />
        <div className="space-y-1">
          <p className="text-caption text-muted-foreground">{type.label}</p>
          <h3 className="text-h4">{point.name}</h3>
          {point.shortDescription ? (
            <p className="text-body-sm text-muted-foreground">{point.shortDescription}</p>
          ) : null}
        </div>
      </div>
    </li>
  );
}

// The list view of docs/StyleGuide.md §5.13: the same points the site plan will show (Task P2.5.01), readable
// on a phone and by a screen reader.
export function ActivityPointList({ points }: ActivityPointListProps) {
  return (
    <ul className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {points.map((point) => (
        <ActivityPointItem key={point.id} point={point} />
      ))}
    </ul>
  );
}
