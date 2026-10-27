import type { Metadata } from 'next';

import { PartyBalanceTable } from '@/components/admin/finance/party-balance-table';
import { InvariantNotice, NetChart, RecapKpis } from '@/components/admin/finance/recap-overview';
import { RwRecapKpis } from '@/components/admin/finance/rw-recap-overview';
import { FilterBar, type FilterField } from '@/components/admin/security/filter-bar';
import { DashboardPageHeader } from '@/components/admin/shell/dashboard-page-header';
import { FormAlert } from '@/components/forms/form-alert';
import { FINANCE_PATH } from '@/config/finance';
import { financeCopy } from '@/lib/copy/finance';
import { todayInJakarta } from '@/lib/utils/dates';
import { parseFinancePeriod, type PeriodRead } from '@/lib/validations/finance';
import { requireDashboardStaff } from '@/server/auth/session';
import { loadFinanceRecap, loadRwFinanceRecap } from '@/server/services/finance-service';

const text = financeCopy.recap;

export const metadata: Metadata = { title: text.title };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function periodFields(period: PeriodRead): FilterField[] {
  return [
    { kind: 'date', name: 'from', label: financeCopy.period.from, value: period.from },
    { kind: 'date', name: 'to', label: financeCopy.period.to, value: period.to },
  ];
}

function PeriodControls({ period }: { period: PeriodRead }) {
  return (
    <>
      <FilterBar fields={periodFields(period)} resetHref={FINANCE_PATH} />
      {period.isInvalid ? <FormAlert tone="danger">{financeCopy.period.invalid}</FormAlert> : null}
    </>
  );
}

// Task P4.7.01 (docs/PRD.md FR-ADMIN-20; docs/Security.md REC-07): the superadmin's recap of a period of at most 12
// months, the last 30 days unless the URL names another: the payments settled and refunded, the ledger invariant, the
// daily net and each party's balance, all read from the ledger views through the finance RPCs at AAL2.
async function SuperadminRecap({ period }: { period: PeriodRead }) {
  const recap = await loadFinanceRecap({ from: period.from, to: period.to });
  return (
    <>
      <DashboardPageHeader title={text.title} description={text.description} />
      <div className="flex flex-col gap-6">
        <PeriodControls period={period} />
        <RecapKpis overview={recap.overview} />
        <InvariantNotice overview={recap.overview} />
        <NetChart daily={recap.overview.daily} period={period} />
        <PartyBalanceTable balances={recap.balances} shares={recap.shares} />
      </div>
    </>
  );
}

// docs/PRD.md §13.1 A26 (owner, 2026-10-27): an RW admin reads their own RW's recap and nothing else: their treasury's
// and their UMKM vendors' shares of the period, by day, and what each is still owed. No payment, booker, account
// number or action; the database keeps the scope (revenue_recap through internal.stats_scope).
async function RwRecap({ period }: { period: PeriodRead }) {
  const recap = await loadRwFinanceRecap({ from: period.from, to: period.to });
  const rwText = financeCopy.rwRecap;
  return (
    <>
      <DashboardPageHeader title={text.title} description={rwText.description} />
      <div className="flex flex-col gap-6">
        <PeriodControls period={period} />
        <RwRecapKpis totals={recap.totals} />
        <NetChart daily={recap.days} period={period} description={rwText.chartDescription} />
        <PartyBalanceTable balances={recap.balances} shares={recap.shares} />
      </div>
    </>
  );
}

export default async function FinancePage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await requireDashboardStaff();
  if (!ctx) return null;
  const period = parseFinancePeriod(await searchParams, todayInJakarta());
  return ctx.role === 'superadmin' ? (
    <SuperadminRecap period={period} />
  ) : (
    <RwRecap period={period} />
  );
}
