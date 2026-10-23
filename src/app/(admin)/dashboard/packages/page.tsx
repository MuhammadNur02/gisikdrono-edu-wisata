import type { Metadata } from 'next';
import Link from 'next/link';

import { PackageTable } from '@/components/admin/packages/package-table';
import { DashboardPageHeader } from '@/components/admin/shell/dashboard-page-header';
import { Button } from '@/components/ui/button';
import { PACKAGE_PATHS } from '@/config/packages';
import { packagesCopy } from '@/lib/copy/packages';
import { contentStatusFacet, listFacets, rwFacet } from '@/lib/utils/facets';
import { loadListQuery } from '@/lib/utils/list-query';
import { archivePackageAction } from '@/server/actions/packages';
import { effectiveRw } from '@/server/auth/content-owner';
import { requireDashboardStaff } from '@/server/auth/session';
import { listPackagesForStaff } from '@/server/services/package-service';
import { listRwUnitsForStaff } from '@/server/services/rw-unit-service';

const text = packagesCopy;

export const metadata: Metadata = { title: text.title };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

// Task P4.3.05, docs/PRD.md FR-ADMIN-05: one page of packages from `?q=&sort=&page=&status=&rw=`. An RW admin's list
// takes no RW filter: tour_packages_staff_read shows them their own RW's packages and, read-only, the combos whose legs
// visit it, which an rw_id filter would hide (review of PR #35, item 7). The superadmin's filter goes through
// effectiveRw.
export default async function PackagesPage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await requireDashboardStaff();
  if (!ctx) return null;
  const query = await loadListQuery(searchParams);
  const rw = ctx.role === 'admin_rw' ? null : await effectiveRw(ctx, query.rw);
  const [result, rwUnits] = await Promise.all([
    listPackagesForStaff({ ...query, rw }),
    listRwUnitsForStaff(),
  ]);
  const isSuperadmin = ctx.role === 'superadmin';
  const facets = listFacets(isSuperadmin, {
    status: contentStatusFacet(text.facets.status),
    rw: rwFacet(text.facets.rw, rwUnits),
  });
  const addButton = (
    <Button asChild>
      <Link href={PACKAGE_PATHS.new}>{text.add}</Link>
    </Button>
  );

  return (
    <>
      <DashboardPageHeader title={text.title} description={text.description} action={addButton} />
      <PackageTable
        rows={result.rows}
        total={result.total}
        facets={facets}
        isSuperadmin={isSuperadmin}
        ownRwId={ctx.rwId}
        archiveAction={archivePackageAction}
      />
    </>
  );
}
