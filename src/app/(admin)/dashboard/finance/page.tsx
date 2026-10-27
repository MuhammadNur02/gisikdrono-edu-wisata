import type { Metadata } from 'next';

import { PartyBalanceTable } from '@/components/admin/finance/party-balance-table';
import { InvariantNotice, NetChart, RecapKpis } from '@/components/admin/finance/recap-overview';
import { FilterBar, type FilterField } from '@/components/admin/security/filter-bar';
import { DashboardPageHeader } from '@/components/admin/shell/dashboard-page-header';
import { FormAlert } from '@/components/forms/form-alert';
import { FINANCE_PATH } from '@/config/finance';
import { financeCopy } from '@/lib/copy/finance';
import { todayInJakarta } from '@/lib/utils/dates';
import { parseFinancePeriod, type PeriodRead } from '@/lib/validations/finance';
import { requireDashboardStaff } from '@/server/auth/session';
import { loadFinanceRecap } from '@/server/services/finance-service';

const text = financeCopy.recap;

export const metadata: Metadata = { title: text.title };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function periodFields(period: PeriodRead): FilterField[] {
  return [
    { kind: 'date', name: 'from', label: financeCopy.period.from, value: period.from },
    { kind: 'date', name: 'to', label: financeCopy.period.to, value: period.to },
  ];
}

// Task P4.7.01 (docs/PRD.md FR-ADMIN-18; docs/Security.md REC-07): the superadmin's recap of a period of at most 12
// months, the last 30 days unless the URL names another: the payments settled and refunded, the ledger invariant, the
// daily net and each party's balance, all read from the ledger views through the finance RPCs at AAL2.
export default async function FinancePage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await requireDashboardStaff();
  if (!ctx) return null;
  if (ctx.role !== 'superadmin') {
    return (
      <>
        <DashboardPageHeader title={text.title} />
        <FormAlert tone="info">{financeCopy.onlySuper}</FormAlert>
      </>
    );
  }
  const period = parseFinancePeriod(await searchParams, todayInJakarta());
  const recap = await loadFinanceRecap({ from: period.from, to: period.to });
  return (
    <>
      <DashboardPageHeader title={text.title} description={text.description} />
      <div className="flex flex-col gap-6">
        <FilterBar fields={periodFields(period)} resetHref={FINANCE_PATH} />
        {period.isInvalid ? <FormAlert tone="danger">{financeCopy.period.invalid}</FormAlert> : null}
        <RecapKpis overview={recap.overview} />
        <InvariantNotice overview={recap.overview} />
        <NetChart overview={recap.overview} period={period} />
        <PartyBalanceTable balances={recap.balances} shares={recap.shares} />
      </div>
    </>
  );
}
