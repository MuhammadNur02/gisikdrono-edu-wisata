import type { Metadata } from 'next';

import { OwnerNotice } from '@/components/admin/cms/owner-notice';
import { PackageForm } from '@/components/admin/packages/package-form';
import { blankPackage } from '@/components/admin/packages/package-values';
import { BackLink } from '@/components/admin/shell/back-link';
import { DashboardPageHeader } from '@/components/admin/shell/dashboard-page-header';
import { PACKAGE_PATHS } from '@/config/packages';
import type { RwId } from '@/config/rw';
import { DB_ENUMS, type EnumValue } from '@/db/enums';
import { copy } from '@/lib/copy/id';
import { createPackageAction } from '@/server/actions/packages';
import { ownerOfNewContent, readRwScope } from '@/server/auth/content-owner';
import { requireDashboardStaff } from '@/server/auth/session';
import { listRwUnitsForStaff } from '@/server/services/rw-unit-service';

const text = copy.packages;

export const metadata: Metadata = { title: text.newTitle };

type Category = EnumValue<'package_category'>;
const RW_CATEGORIES = DB_ENUMS.package_category.filter((category) => category !== 'combo');

// An RW admin makes RW packages for their own RW. The superadmin makes those for the RW the RwSwitcher points at, and
// combos, which belong to the kelurahan; under Semua there is no RW to file an RW package under, so only a combo.
function categoriesFor(isSuperadmin: boolean, owner: RwId | null): readonly Category[] {
  if (!isSuperadmin) return RW_CATEGORIES;
  return owner === null ? ['combo'] : DB_ENUMS.package_category;
}

// Task P4.3.05, docs/PRD.md FR-ADMIN-05. Photos come after the first save, once the package has an id and a folder.
export default async function NewPackagePage() {
  const ctx = await requireDashboardStaff();
  if (!ctx) return null;
  const owner = ownerOfNewContent(ctx, await readRwScope());
  if (owner === undefined) return null;
  const isSuperadmin = ctx.role === 'superadmin';
  const categories = categoriesFor(isSuperadmin, owner);
  const rwUnits = await listRwUnitsForStaff();
  const [firstCategory = 'regular'] = categories;

  return (
    <>
      <BackLink href={PACKAGE_PATHS.list} label={text.back} />
      <DashboardPageHeader title={text.newTitle} />
      <OwnerNotice owner={owner} isSuperadmin={isSuperadmin} />
      <PackageForm
        initial={blankPackage(firstCategory)}
        action={createPackageAction}
        stored={null}
        categories={categories}
        rwOptions={rwUnits.map((unit) => ({ id: unit.id, name: unit.name }))}
        readOnly={false}
      />
    </>
  );
}
