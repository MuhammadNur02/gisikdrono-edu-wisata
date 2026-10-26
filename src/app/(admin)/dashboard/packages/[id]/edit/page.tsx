import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { PackageForm } from '@/components/admin/packages/package-form';
import { packageValues } from '@/components/admin/packages/package-values';
import { PriceHistory } from '@/components/admin/packages/price-history';
import { BackLink } from '@/components/admin/shell/back-link';
import { DashboardPageHeader } from '@/components/admin/shell/dashboard-page-header';
import { ContentStatusBadge } from '@/components/admin/status/status-badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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

interface EditPackagePageProps {
  params: Promise<{ id: string }>;
}

// Task P4.3.05, docs/PRD.md FR-ADMIN-05. RLS shows an RW admin their own RW's packages and the combos that visit it;
// any other answers 404, like one that does not exist. A combo opens read-only for them.
export default async function EditPackagePage({ params }: EditPackagePageProps) {
  const ctx = await requireDashboardStaff();
  if (!ctx) return null;
  const id = rowIdSchema.safeParse((await params).id);
  const pkg = id.success ? await readPackageForStaff(id.data) : null;
  if (!pkg) notFound();
  const [history, rwUnits] = await Promise.all([listPriceHistory(pkg.id), listRwUnitsForStaff()]);
  const isCombo = pkg.category === 'combo';

  return (
    <>
      <BackLink href={PACKAGE_PATHS.list} label={text.back} />
      <DashboardPageHeader title={pkg.name} action={<ContentStatusBadge status={pkg.status} />} />
      <Tabs defaultValue={TAB_DETAIL}>
        <TabsList variant="pill">
          <TabsTrigger value={TAB_DETAIL}>{text.editTitle}</TabsTrigger>
          <TabsTrigger value={TAB_HISTORY}>{text.sections.history}</TabsTrigger>
        </TabsList>
        <TabsContent value={TAB_DETAIL}>
          <PackageForm
            initial={packageValues(pkg)}
            action={updatePackageAction}
            stored={{ id: pkg.id, owner: pkg.rwId }}
            categories={isCombo ? ['combo'] : RW_CATEGORIES}
            rwOptions={rwUnits.map((unit) => ({ id: unit.id, name: unit.name }))}
            readOnly={!canWriteFor(ctx, pkg.rwId)}
          />
        </TabsContent>
        <TabsContent value={TAB_HISTORY}>
          <PriceHistory entries={history} />
        </TabsContent>
      </Tabs>
    </>
  );
}
