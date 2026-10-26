import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { z } from 'zod';

import { PackageForm } from '@/components/admin/packages/package-form';
import { packageValues } from '@/components/admin/packages/package-values';
import { PriceHistory } from '@/components/admin/packages/price-history';
import { BackLink } from '@/components/admin/shell/back-link';
import { DashboardPageHeader } from '@/components/admin/shell/dashboard-page-header';
import { LinkTabs } from '@/components/admin/shell/link-tabs';
import { ContentStatusBadge } from '@/components/admin/status/status-badge';
import { PACKAGE_PATHS } from '@/config/packages';
import { DB_ENUMS } from '@/db/enums';
import { packagesCopy } from '@/lib/copy/packages';
import { rowIdSchema } from '@/lib/validations/content';
import { updatePackageAction } from '@/server/actions/packages';
import { canWriteFor } from '@/server/auth/content-owner';
import { requireDashboardStaff } from '@/server/auth/session';
import { listPriceHistory } from '@/server/services/package-history-service';
import { readPackageForStaff } from '@/server/services/package-service';
import { listRwUnitsForStaff } from '@/server/services/rw-unit-service';

const text = packagesCopy;

export const metadata: Metadata = { title: text.editTitle };

const RW_CATEGORIES = DB_ENUMS.package_category.filter((category) => category !== 'combo');
const TAB_DETAIL = 'detail';
const TAB_HISTORY = 'history';
// ?tab= picks the panel; anything else shows the form.
const tabSchema = z.enum([TAB_DETAIL, TAB_HISTORY]).catch(TAB_DETAIL);

interface EditPackagePageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string | string[] }>;
}

function tabsFor(id: string) {
  const base = PACKAGE_PATHS.edit(id);
  return [
    { value: TAB_DETAIL, label: text.editTitle, href: base },
    { value: TAB_HISTORY, label: text.sections.history, href: `${base}?tab=${TAB_HISTORY}` },
  ];
}

// Task P4.3.05, docs/PRD.md FR-ADMIN-05. RLS shows an RW admin their own RW's packages and the combos that visit it;
// any other answers 404, like one that does not exist. A combo opens read-only for them. The form and the price
// history are two addresses (LinkTabs), so the page ships no tabs script.
export default async function EditPackagePage({ params, searchParams }: EditPackagePageProps) {
  const ctx = await requireDashboardStaff();
  if (!ctx) return null;
  const id = rowIdSchema.safeParse((await params).id);
  const pkg = id.success ? await readPackageForStaff(id.data) : null;
  if (!pkg) notFound();
  const tab = tabSchema.parse((await searchParams).tab);
  const isCombo = pkg.category === 'combo';

  return (
    <>
      <BackLink href={PACKAGE_PATHS.list} label={text.back} />
      <DashboardPageHeader title={pkg.name} action={<ContentStatusBadge status={pkg.status} />} />
      <div className="flex flex-col gap-4">
        <LinkTabs tabs={tabsFor(pkg.id)} active={tab} label={pkg.name} />
        {tab === TAB_HISTORY ? (
          <PriceHistory entries={await listPriceHistory(pkg.id)} />
        ) : (
          <PackageForm
            initial={packageValues(pkg)}
            action={updatePackageAction}
            stored={{ id: pkg.id, owner: pkg.rwId }}
            categories={isCombo ? ['combo'] : RW_CATEGORIES}
            rwOptions={(await listRwUnitsForStaff()).map((unit) => ({
              id: unit.id,
              name: unit.name,
            }))}
            readOnly={!canWriteFor(ctx, pkg.rwId)}
          />
        )}
      </div>
    </>
  );
}
