import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

import { TrendChip } from '@/components/admin/kpi/trend-chip';
import type { Trend } from '@/lib/utils/kpi';

export interface KpiCardProps {
  label: string;
  icon: LucideIcon;
  // The figure as it reads: a CountUp, a formatted amount, or the "not available" text.
  value: ReactNode;
  hint: string;
  trend?: Trend;
  // A Sparkline of the last 30 days, when the figure has one.
  chart?: ReactNode;
}

// docs/StyleGuide.md §6.3: label, figure, trend chip and an icon tile top-right; a sparkline under the figure.
export function KpiCard({ label, icon, value, hint, trend, chart }: KpiCardProps) {
  const Icon = icon;
  return (
    <div className="flex flex-col gap-3 rounded-xl border bg-card p-5 text-card-foreground">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <p className="text-caption text-muted-foreground">{label}</p>
          <p className="text-h2 tabular-nums">{value}</p>
        </div>
        <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-secondary text-secondary-foreground">
          <Icon aria-hidden className="size-5" />
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {trend ? <TrendChip trend={trend} /> : null}
        <p className="text-caption text-muted-foreground">{hint}</p>
      </div>
      {chart}
    </div>
  );
}
