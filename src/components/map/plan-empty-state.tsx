import { MapPinOff } from 'lucide-react';

import { PLAN_ASPECT_CLASS } from '@/config/map';
import { mapCopy } from '@/lib/copy/map';
import { cn } from '@/lib/utils/cn';

// What /peta-kontak shows in the plan's place while activity_points has no published row: one lucide icon in a
// muted tile (docs/StyleGuide.md §8.5), at the plan's proportions so the page keeps its shape once points exist.
export function PlanEmptyState() {
  return (
    <div
      role="status"
      className={cn(
        'flex w-full flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-muted/40 px-6 py-12 text-center',
        PLAN_ASPECT_CLASS,
      )}
    >
      <span className="rounded-full bg-muted p-3">
        <MapPinOff aria-hidden className="size-6 text-muted-foreground" />
      </span>
      <p className="text-h4">{mapCopy.planEmptyTitle}</p>
      <p className="max-w-md text-body-sm text-pretty text-muted-foreground">
        {mapCopy.planEmptyDescription}
      </p>
    </div>
  );
}
