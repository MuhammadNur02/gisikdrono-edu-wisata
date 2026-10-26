import type { Metadata } from 'next';
import dynamic from 'next/dynamic';

import { DashboardPageHeader } from '@/components/admin/shell/dashboard-page-header';
import { FormAlert } from '@/components/forms/form-alert';
import { settingsCopy } from '@/lib/copy/settings';
import {
  loadBankAccountAction,
  revealBankAccountAction,
  setBankAccountAction,
} from '@/server/actions/bank-accounts';
import { updateSiteSettingsAction } from '@/server/actions/settings';
import { verifyStaffTotpAction } from '@/server/actions/staff-totp';
import { requireDashboardStaff } from '@/server/auth/session';
import { listRwTreasuryAccounts } from '@/server/services/bank-account-service';
import { readSiteSettingsForStaff } from '@/server/services/settings-service';

const text = settingsCopy;

export const metadata: Metadata = { title: text.title };

// The form, its fields and the step-up dialog stay out of the shared first load (admin budget, review of PR #35).
const SettingsForm = dynamic(() =>
  import('@/components/admin/settings/settings-form').then((module) => module.SettingsForm),
);
const RwTreasuries = dynamic(() =>
  import('@/components/admin/bank-accounts/rw-treasuries').then((module) => module.RwTreasuries),
);

const BANK_ACTIONS = {
  load: loadBankAccountAction,
  reveal: revealBankAccountAction,
  save: setBankAccountAction,
  stepUp: verifyStaffTotpAction,
};

// Task P4.9.01, docs/PRD.md §8.6: the superadmin's alone, at AAL2 (the dashboard layout), and every save asks for a
// fresh authenticator code. An RW admin has no menu item for it, and opening the address directly says so.
export default async function SettingsPage() {
  const ctx = await requireDashboardStaff();
  if (!ctx) return null;
  if (ctx.role !== 'superadmin') {
    return (
      <>
        <DashboardPageHeader title={text.title} />
        <FormAlert tone="info">{text.onlySuper}</FormAlert>
      </>
    );
  }
  const [settings, treasuries] = await Promise.all([
    readSiteSettingsForStaff(),
    listRwTreasuryAccounts(),
  ]);

  return (
    <>
      <DashboardPageHeader title={text.title} description={text.description} />
      <div className="flex max-w-3xl flex-col gap-6">
        <SettingsForm
          settings={settings}
          saveAction={updateSiteSettingsAction}
          verifyAction={verifyStaffTotpAction}
        />
        <RwTreasuries treasuries={treasuries} actions={BANK_ACTIONS} />
      </div>
    </>
  );
}
