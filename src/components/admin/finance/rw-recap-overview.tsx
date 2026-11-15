import { KpiCard, KpiLedger } from '@/components/admin/kpi/kpi-card';
import { financeCopy } from '@/lib/copy/finance';
import { formatIDR } from '@/lib/utils/currency';
import type { RwFinanceRecap } from '@/types/finance';

const text = financeCopy.rwRecap;

// docs/PRD.md §13.1 A26: an RW admin's own figures, summed on the server from revenue_recap (CLAUDE.md §7.1). The
// period's shares of the RW's treasury and vendors, and what the ledger still owes them in all.
export function RwRecapKpis({ totals }: { totals: RwFinanceRecap['totals'] }) {
  return (
    <KpiLedger label={financeCopy.recap.title} columns="four">
      <KpiCard label={text.net} value={formatIDR(totals.net)} hint={text.netHint} />
      <KpiCard label={text.settled} value={formatIDR(totals.settled)} hint={text.settledHint} />
      <KpiCard label={text.reversed} value={formatIDR(totals.reversed)} hint={text.reversedHint} />
      <KpiCard
        label={text.outstanding}
        value={formatIDR(totals.outstanding)}
        hint={text.outstandingHint}
      />
    </KpiLedger>
  );
}
