import type { Metadata } from 'next';

import type { Option } from '@/components/admin/finance/option-select';
import { PayoutDialog } from '@/components/admin/finance/payout-dialog';
import { PayoutTable } from '@/components/admin/finance/payout-table';
import { RuleDialog } from '@/components/admin/finance/rule-dialog';
import { RulesTable } from '@/components/admin/finance/rules-table';
import { DashboardPageHeader } from '@/components/admin/shell/dashboard-page-header';
import { FormAlert } from '@/components/forms/form-alert';
import { FINANCE_DEFAULT_PERIOD_DAYS } from '@/config/finance';
import { financeCopy } from '@/lib/copy/finance';
import { formatIDR } from '@/lib/utils/currency';
import { todayInJakarta } from '@/lib/utils/dates';
import { partyLabel } from '@/lib/utils/finance-display';
import { dayBefore, visitDateAfter } from '@/lib/utils/kpi';
import {
  previewPayoutAction,
  saveRevenueRuleAction,
  settlePayoutAction,
} from '@/server/actions/finance';
import { viewFinanceEvidenceAction } from '@/server/actions/finance-evidence';
import { verifyStaffTotpAction } from '@/server/actions/staff-totp';
import { requireDashboardStaff } from '@/server/auth/session';
import { loadFinanceRecap } from '@/server/services/finance-service';
import {
  listPayouts,
  listRevenueRules,
  listRuleTargets,
  readExpectedPayoutAccount,
} from '@/server/services/revenue-share-service';
import { listRwUnitsForStaff } from '@/server/services/rw-unit-service';
import type { PartyBalance } from '@/types/finance';

const text = financeCopy.rules;

export const metadata: Metadata = { title: text.title };

function partyOptions(balances: readonly PartyBalance[]): Option[] {
  return balances.map((balance) => ({
    value: balance.beneficiaryKey,
    label: `${partyLabel(balance.beneficiaryKey, balance.name || null)} · ${financeCopy.recap.columns.outstanding} ${formatIDR(balance.outstanding)}`,
  }));
}

function AccountBanner({ account }: { account: string | null }) {
  return account ? (
    <FormAlert tone="info">{financeCopy.account.expected(account)}</FormAlert>
  ) : (
    <FormAlert tone="danger">{financeCopy.account.unset}</FormAlert>
  );
}

async function loadRevenueShare(today: string) {
  const periodStart = visitDateAfter(today, -FINANCE_DEFAULT_PERIOD_DAYS);
  const [rules, targets, payouts, account, rwUnits, recap] = await Promise.all([
    listRevenueRules(),
    listRuleTargets(),
    listPayouts(),
    readExpectedPayoutAccount(),
    listRwUnitsForStaff(),
    loadFinanceRecap({ from: periodStart, to: today }),
  ]);
  const rwOptions = rwUnits.map((unit) => ({ value: String(unit.id), label: unit.name }));
  return { rules, targets, payouts, account, rwOptions, balances: recap.balances };
}

// The page's two writes: a rule's new version, and a payout.
function pageActions(data: Awaited<ReturnType<typeof loadRevenueShare>>, today: string) {
  return {
    newVersion: (
      <RuleDialog
        targets={data.targets}
        rwOptions={data.rwOptions}
        today={today}
        saveAction={saveRevenueRuleAction}
        stepUpAction={verifyStaffTotpAction}
      />
    ),
    recordPayout: (
      <PayoutDialog
        parties={partyOptions(data.balances)}
        lastPayableDay={dayBefore(today)}
        previewAction={previewPayoutAction}
        settleAction={settlePayoutAction}
        stepUpAction={verifyStaffTotpAction}
      />
    ),
  };
}

// Task P4.7.02 (docs/PRD.md FR-ADMIN-19, FR-ADMIN-20; docs/Security.md REC-05, REC-10, PAY-16): the revenue rules and
// their history, a new version of one, and the payouts to each party, beside the payout account Midtrans should pay
// into. The superadmin's alone, at AAL2; every write asks for the authenticator code.
export default async function RevenueSharePage() {
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
  const today = todayInJakarta();
  const data = await loadRevenueShare(today);
  const { newVersion, recordPayout } = pageActions(data, today);
  return (
    <>
      <DashboardPageHeader title={text.title} description={text.description} action={newVersion} />
      <div className="flex flex-col gap-6">
        <AccountBanner account={data.account} />
        <RulesTable rules={data.rules} targets={data.targets} today={today} />
        <PayoutTable
          payouts={data.payouts}
          balances={data.balances}
          action={recordPayout}
          viewAction={viewFinanceEvidenceAction}
        />
      </div>
    </>
  );
}
