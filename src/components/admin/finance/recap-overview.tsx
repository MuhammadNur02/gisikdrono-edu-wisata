import { Banknote, CreditCard, Undo2, Wallet } from 'lucide-react';

import { ChartCard } from '@/components/admin/charts/chart-card';
import { LazyRevenueArea } from '@/components/admin/charts/lazy-charts';
import { KpiCard } from '@/components/admin/kpi/kpi-card';
import { FormAlert } from '@/components/forms/form-alert';
import { financeCopy } from '@/lib/copy/finance';
import { formatIDR } from '@/lib/utils/currency';
import { netSeries } from '@/lib/utils/finance-display';
import { hasAnyValue } from '@/lib/utils/kpi';
import type { FinanceOverview, FinancePeriod, LedgerInvariant } from '@/types/finance';

const text = financeCopy.recap;

// Task P4.7.01: the period's totals from finance_overview, never added up in the browser (CLAUDE.md §7.1).
export function RecapKpis({ overview }: { overview: FinanceOverview }) {
  const { totals } = overview;
  return (
    <section
      aria-label={text.title}
      className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4"
    >
      <KpiCard
        label={text.gross}
        icon={Wallet}
        value={formatIDR(totals.grossSettled)}
        hint={text.grossHint(totals.paymentsCount)}
      />
      <KpiCard
        label={text.refunds}
        icon={Undo2}
        value={formatIDR(totals.refunds)}
        hint={text.refundsHint}
      />
      <KpiCard label={text.net} icon={Banknote} value={formatIDR(totals.net)} hint={text.netHint} />
      <KpiCard
        label={text.methods}
        icon={CreditCard}
        value={String(totals.paymentsCount)}
        hint={text.methodsHint(totals.qrisCount, totals.vaCount)}
      />
    </section>
  );
}

// docs/PRD.md §10.3: what the ledger holds against what the period's bookings were paid less what was refunded less
// the Midtrans fees of their weather refunds, each figure as finance_overview gives it.
export function InvariantNotice({ overview }: { overview: FinanceOverview }) {
  const { invariant } = overview;
  return (
    <div className="flex flex-col gap-3">
      {invariant.mismatchedBookings === 0 ? (
        <FormAlert tone="info">{text.invariantOk(invariant.bookings)}</FormAlert>
      ) : (
        <FormAlert tone="danger">{text.invariantBroken(invariant.mismatchedBookings)}</FormAlert>
      )}
      <InvariantLines invariant={invariant} />
    </div>
  );
}

function InvariantLines({ invariant }: { invariant: LedgerInvariant }) {
  const lines = text.invariantLines;
  const facts = [
    { label: lines.weatherRefundFees, value: invariant.weatherRefundFees, hint: null },
    { label: lines.expected, value: invariant.expected, hint: lines.expectedHint },
    { label: lines.ledger, value: invariant.ledger, hint: null },
  ];
  return (
    <dl aria-label={lines.label} className="grid gap-3 text-body-sm sm:grid-cols-3">
      {facts.map((fact) => (
        <div key={fact.label}>
          <dt className="text-caption text-muted-foreground">{fact.label}</dt>
          <dd className="font-medium tabular-nums">{formatIDR(fact.value)}</dd>
          {fact.hint ? <dd className="text-caption text-muted-foreground">{fact.hint}</dd> : null}
        </div>
      ))}
    </dl>
  );
}

export function NetChart({
  overview,
  period,
}: {
  overview: FinanceOverview;
  period: FinancePeriod;
}) {
  const series = netSeries(overview.daily, period);
  return (
    <ChartCard
      title={text.chartTitle}
      description={text.chartDescription}
      hasData={hasAnyValue(series)}
      empty={text.chartEmpty}
    >
      <LazyRevenueArea
        series={series}
        seriesName={text.chartSeries}
        summary={text.chartSummary(series.length)}
      />
    </ChartCard>
  );
}
