import { ArrowDownRight, ArrowUpRight, Minus, type LucideIcon } from 'lucide-react';

import { copy } from '@/lib/copy/id';
import { cn } from '@/lib/utils/cn';
import type { Trend, TrendDirection } from '@/lib/utils/kpi';

const text = copy.dashboard.overview;

const percentFormat = new Intl.NumberFormat('id-ID', {
  maximumFractionDigits: 1,
  signDisplay: 'exceptZero',
});

const TONES: Record<TrendDirection, { icon: LucideIcon; className: string }> = {
  up: { icon: ArrowUpRight, className: 'bg-success-soft text-success-soft-foreground' },
  down: { icon: ArrowDownRight, className: 'bg-danger-soft text-danger-soft-foreground' },
  flat: { icon: Minus, className: 'bg-neutral-soft text-neutral-soft-foreground' },
};

function trendLabel({ direction, percent }: Trend): string {
  if (percent !== null) return `${percentFormat.format(percent)} %`;
  return direction === 'flat' ? text.trendFlat : text.trendNew;
}

export interface TrendChipProps {
  trend: Trend;
}

// docs/StyleGuide.md §6.3: the change against the same days of last month, named in `title`. Two empty periods
// show no chip at all, so an empty dashboard does not claim a trend.
export function TrendChip({ trend }: TrendChipProps) {
  if (trend.direction === 'flat' && trend.percent === null) return null;
  const { icon: Icon, className } = TONES[trend.direction];
  const label = trendLabel(trend);
  return (
    <span
      title={text.trendTitle}
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-caption font-medium tabular-nums',
        className,
      )}
    >
      <Icon aria-hidden className="size-3.5" />
      {label}
      <span className="sr-only">{`, ${text.trendTitle.toLowerCase()}`}</span>
    </span>
  );
}
