import type { ReactNode } from 'react';

import { TrendChip } from '@/components/admin/kpi/trend-chip';
import { copy } from '@/lib/copy/id';
import { cn } from '@/lib/utils/cn';
import type { Trend } from '@/lib/utils/kpi';

export interface KpiCardProps {
  label: string;
  // The figure as it reads: a CountUp, a formatted amount, or the "not available" text.
  value: ReactNode;
  hint: string;
  trend?: Trend;
  // A Sparkline of the last 30 days, when the figure has one.
  chart?: ReactNode;
}

// A figure the overview could not read whole: said in words, never a partial number (review of PR #45, H1).
export function KpiUnavailable() {
  return (
    <span className="text-body font-medium text-muted-foreground">
      {copy.dashboard.overview.unavailable}
    </span>
  );
}

// docs/StyleGuide.md §6.3 (Dasbor Gelap): one column of a KpiLedger. The label, the figure with its sparkline beside it,
// then the trend chip and a hint.
export function KpiCard({ label, value, hint, trend, chart }: KpiCardProps) {
  return (
    <div className="flex min-w-0 flex-col gap-2.5 bg-card p-4 text-card-foreground md:p-5">
      <p className="text-caption font-medium text-muted-foreground">{label}</p>
      <div className="flex items-end justify-between gap-3">
        <p className="min-w-0 text-h2 font-bold tabular-nums">{value}</p>
        {chart}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {trend ? <TrendChip trend={trend} /> : null}
        <p className="text-caption text-muted-foreground">{hint}</p>
      </div>
    </div>
  );
}

const LEDGER_COLUMNS = {
  three: 'grid-cols-1 md:grid-cols-3',
  four: 'grid-cols-2 md:grid-cols-4',
} as const;

export interface KpiLedgerProps {
  label: string;
  // Three or four KpiCards: two columns on a phone for four, one for three; one row from md up.
  columns: keyof typeof LEDGER_COLUMNS;
  children: ReactNode;
}

// The figures as one ledger: a single card split by hairlines, never a grid of separate boxes (Dasbor Gelap).
export function KpiLedger({ label, columns, children }: KpiLedgerProps) {
  return (
    <section
      aria-label={label}
      className={cn(
        'grid gap-px overflow-hidden rounded-xl border bg-border',
        LEDGER_COLUMNS[columns],
      )}
    >
      {children}
    </section>
  );
}
