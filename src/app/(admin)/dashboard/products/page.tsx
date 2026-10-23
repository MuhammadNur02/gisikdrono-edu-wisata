import type { Metadata } from 'next';
import Link from 'next/link';

import { ProductTable } from '@/components/admin/products/product-table';
import { VendorSheet } from '@/components/admin/products/vendor-sheet';
import { DashboardPageHeader } from '@/components/admin/shell/dashboard-page-header';
import { FormAlert } from '@/components/forms/form-alert';
import { Button } from '@/components/ui/button';
import { PRODUCT_PATHS } from '@/config/products';
import { PRODUCT_CATEGORY } from '@/config/status';
import { DB_ENUMS } from '@/db/enums';
import { copy } from '@/lib/copy/id';
import { contentStatusFacet, listFacets, rwFacet } from '@/lib/utils/facets';
import { loadListQuery } from '@/lib/utils/list-query';
import { archiveProductAction } from '@/server/actions/products';
import { createVendorAction, updateVendorAction } from '@/server/actions/vendors';
import { effectiveRw, ownerOfNewContent, readRwScope } from '@/server/auth/content-owner';
import { requireDashboardStaff } from '@/server/auth/session';
import { listProductsForStaff } from '@/server/services/product-service';
import { listRwUnitsForStaff } from '@/server/services/rw-unit-service';
import { listVendorsForStaff } from '@/server/services/vendor-service';
import type { ListFacet } from '@/types/data-table';
import type { VendorAdmin } from '@/types/vendor';

const text = copy.products;

export const metadata: Metadata = { title: text.title };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const VENDOR_ACTIONS = { create: createVendorAction, update: updateVendorAction };

const CATEGORY_FACET: ListFacet = {
  param: 'category',
  title: text.facets.category,
  options: DB_ENUMS.product_category.map((category) => ({
    value: category,
    label: PRODUCT_CATEGORY[category].label,
  })),
};

function HeaderActions({
  isSuperadmin,
  rwName,
  vendors,
}: {
  isSuperadmin: boolean;
  rwName: string | null;
  vendors: readonly VendorAdmin[];
}) {
  return (
    <div className="flex flex-wrap gap-2">
      <VendorSheet
        rwName={rwName}
        vendors={vendors}
        actions={isSuperadmin ? VENDOR_ACTIONS : null}
      />
      {isSuperadmin ? (
        <Button asChild>
          <Link href={PRODUCT_PATHS.new}>{text.add}</Link>
        </Button>
      ) : null}
    </div>
  );
}

// Task P4.3.06, docs/PRD.md FR-ADMIN-06: one page of products from `?q=&sort=&page=&status=&category=&rw=`. Entry is
// the superadmin's (decision of 2026-10-24); an RW admin reads their own RW's products and vendors (effectiveRw).
export default async function ProductsPage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await requireDashboardStaff();
  if (!ctx) return null;
  const query = await loadListQuery(searchParams);
  const isSuperadmin = ctx.role === 'superadmin';
  const [rw, rwUnits, scope] = await Promise.all([
    effectiveRw(ctx, query.rw),
    listRwUnitsForStaff(),
    readRwScope(),
  ]);
  const vendorRw = ownerOfNewContent(ctx, scope) ?? null;
  const [result, vendors] = await Promise.all([
    listProductsForStaff({ ...query, rw }),
    vendorRw === null ? Promise.resolve([]) : listVendorsForStaff(vendorRw),
  ]);
  const facets = listFacets(isSuperadmin, {
    status: contentStatusFacet(text.facets.status),
    others: [CATEGORY_FACET],
    rw: rwFacet(text.facets.rw, rwUnits),
  });
  const actions = (
    <HeaderActions
      isSuperadmin={isSuperadmin}
      rwName={rwUnits.find((unit) => unit.id === vendorRw)?.name ?? null}
      vendors={vendors}
    />
  );

  return (
    <>
      <DashboardPageHeader title={text.title} description={text.description} action={actions} />
      {isSuperadmin ? null : <FormAlert tone="info">{text.readOnly}</FormAlert>}
      <ProductTable
        rows={result.rows}
        total={result.total}
        facets={facets}
        archiveAction={isSuperadmin ? archiveProductAction : null}
      />
    </>
  );
}
