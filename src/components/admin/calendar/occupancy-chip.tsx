import { Badge } from '@/components/ui/badge';
import { sessionsCopy } from '@/lib/copy/sessions';
import { occupancyOf } from '@/lib/utils/sessions';

const text = sessionsCopy.occupancy;

export interface OccupancyChipProps {
  reservedPax: number;
  capacity: number;
}

// docs/StyleGuide.md §6.5: occupancy is a derived chip, not an enum: nothing below 80 %, `Hampir Penuh` from 80 %,
// `Penuh` at the whole capacity. The count itself is always read out.
export function OccupancyChip({ reservedPax, capacity }: OccupancyChipProps) {
  const occupancy = occupancyOf(reservedPax, capacity);
  const label = text.label(reservedPax, capacity);
  if (occupancy === 'open') {
    return <span className="text-body-sm text-muted-foreground tabular-nums">{label}</span>;
  }
  return (
    <span className="inline-flex items-center gap-2">
      <span className="text-body-sm text-muted-foreground tabular-nums">{label}</span>
      <Badge variant={occupancy === 'full' ? 'danger' : 'warning'}>
        {occupancy === 'full' ? text.full : text.nearlyFull}
      </Badge>
    </span>
  );
}
