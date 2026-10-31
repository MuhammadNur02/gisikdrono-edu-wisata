import type { Metadata } from 'next';
import dynamic from 'next/dynamic';

import { DashboardPageHeader } from '@/components/admin/shell/dashboard-page-header';
import { FormAlert } from '@/components/forms/form-alert';
import { ALL_STAFF_ROLES } from '@/config/staff';
import { settingsCopy } from '@/lib/copy/settings';
import {
  loadBankAccountAction,
  revealBankAccountAction,
  setBankAccountAction,
} from '@/server/actions/bank-accounts';
import { updateCatalogueSettingsAction, updateSiteSettingsAction } from '@/server/actions/settings';
import { verifyStaffTotpAction } from '@/server/actions/staff-totp';
import { requireDashboardStaff } from '@/server/auth/session';
import { listRwTreasuryAccounts } from '@/server/services/bank-account-service';
import {
  readCatalogueSettingsForStaff,
  readSiteSettingsForStaff,
} from '@/server/services/settings-service';

const text = settingsCopy;

export const metadata: Metadata = { title: text.title };

// The form, its fields and the step-up dialog stay out of the shared first load (admin budget, review of PR #35).
const SettingsForm = dynamic(() =>
  import('@/components/admin/settings/settings-form').then((module) => module.SettingsForm),
);
const CatalogueSettingsForm = dynamic(() =>
  import('@/components/admin/settings/catalogue-settings-form').then(
    (module) => module.CatalogueSettingsForm,
  ),
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

// Pengaturan Katalog (docs/PRD.md §13.1 A30): the Kopdes admin's three catalogue keys, and nothing else of the page.
async function CatalogueSettingsPage() {
  const settings = await readCatalogueSettingsForStaff();
  return (
    <>
      <DashboardPageHeader title={text.catalogue.title} description={text.catalogue.description} />
      <div className="flex max-w-3xl flex-col gap-6">
        <CatalogueSettingsForm
          settings={settings}
          saveAction={updateCatalogueSettingsAction}
          verifyAction={verifyStaffTotpAction}
        />
      </div>
    </>
  );
}

// Task P4.9.01, docs/PRD.md §8.6: the superadmin's alone, at AAL2 (the dashboard layout), and every save asks for a
// fresh authenticator code; the Kopdes admin gets its catalogue keys here instead. An RW admin has no menu item for
// it, and opening the address directly says so.
export default async function SettingsPage() {
  const ctx = await requireDashboardStaff(ALL_STAFF_ROLES);
  if (!ctx) return null;
  if (ctx.role === 'admin_kopdes') return <CatalogueSettingsPage />;
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
