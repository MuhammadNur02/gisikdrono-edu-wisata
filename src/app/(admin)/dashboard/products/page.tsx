import type { Metadata } from 'next';
import Link from 'next/link';

import { ProductTable } from '@/components/admin/products/product-table';
import { VendorSheet } from '@/components/admin/products/vendor-sheet';
import { DashboardPageHeader } from '@/components/admin/shell/dashboard-page-header';
import { RwSwitcher } from '@/components/admin/shell/rw-switcher';
import { FormAlert } from '@/components/forms/form-alert';
import { Button } from '@/components/ui/button';
import type { RwScope } from '@/config/dashboard';
import { PRODUCT_PATHS, VENDORS_OPEN_PARAM, VENDORS_OPEN_VALUE } from '@/config/products';
import { ALL_STAFF_ROLES } from '@/config/staff';
import { PRODUCT_CATEGORY } from '@/config/status';
import { DB_ENUMS } from '@/db/enums';
import { productsCopy } from '@/lib/copy/products';
import { contentStatusFacet, listFacets, rwFacet } from '@/lib/utils/facets';
import { loadListQuery } from '@/lib/utils/list-query';
import {
  loadBankAccountAction,
  revealBankAccountAction,
  setBankAccountAction,
} from '@/server/actions/bank-accounts';
import { setRwScopeAction } from '@/server/actions/dashboard';
import { archiveProductAction } from '@/server/actions/products';
import { verifyStaffTotpAction } from '@/server/actions/staff-totp';
import { createVendorAction, updateVendorAction } from '@/server/actions/vendors';
import { effectiveRw, isUmkmManager, readRwScope, umkmRwFor } from '@/server/auth/content-owner';
import { requireDashboardStaff, type DashboardStaff } from '@/server/auth/session';
import { listProductsForStaff } from '@/server/services/product-service';
import { listRwUnitsForStaff } from '@/server/services/rw-unit-service';
import { listVendorsForStaff } from '@/server/services/vendor-service';
import type { ListFacet } from '@/types/data-table';
import type { RwBadge } from '@/types/rw-unit';
import type { VendorAdmin } from '@/types/vendor';

const text = productsCopy;

export const metadata: Metadata = { title: text.title };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const VENDOR_ACTIONS = {
  create: createVendorAction,
  update: updateVendorAction,
  bank: {
    load: loadBankAccountAction,
    reveal: revealBankAccountAction,
    save: setBankAccountAction,
    stepUp: verifyStaffTotpAction,
  },
};

const CATEGORY_FACET: ListFacet = {
  param: 'category',
  title: text.facets.category,
  options: DB_ENUMS.product_category.map((category) => ({
    value: category,
    label: PRODUCT_CATEGORY[category].label,
  })),
};

interface HeaderActionsProps {
  canManage: boolean;
  rwName: string | null;
  vendors: readonly VendorAdmin[];
  // The vendors sheet opens with the page when the menu's Penjual UMKM led here.
  vendorsOpen: boolean;
}

function HeaderActions({ canManage, rwName, vendors, vendorsOpen }: HeaderActionsProps) {
  return (
    <div className="flex flex-wrap gap-2">
      <VendorSheet
        rwName={rwName}
        vendors={vendors}
        actions={canManage ? VENDOR_ACTIONS : null}
        defaultOpen={vendorsOpen}
      />
      {canManage ? (
        <Button asChild>
          <Link href={PRODUCT_PATHS.new}>{text.add}</Link>
        </Button>
      ) : null}
    </div>
  );
}

// docs/PRD.md §13.1 A30: the Kopdes admin has no RwSwitcher in the shell, so its RW choice for new products and
// vendors sits here, on the one page it files them from; the superadmin keeps the shell's.
function KopdesRwChoice({ scope, rws }: { scope: RwScope; rws: readonly RwBadge[] }) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <p className="text-body-sm font-medium">{text.rwChoice}</p>
      <RwSwitcher scope={scope} rws={rws} action={setRwScopeAction} />
    </div>
  );
}

// The list, the RW the vendors sheet works on and its vendors, and the RWs.
async function loadProducts(ctx: DashboardStaff, params: Awaited<SearchParams>) {
  const query = loadListQuery(params);
  const [rw, rwUnits, scope] = await Promise.all([
    effectiveRw(ctx, query.rw),
    listRwUnitsForStaff(),
    readRwScope(),
  ]);
  const vendorRw = umkmRwFor(ctx, scope);
  const [result, vendors] = await Promise.all([
    listProductsForStaff({ ...query, rw }),
    vendorRw === null ? Promise.resolve([]) : listVendorsForStaff(vendorRw),
  ]);
  return { result, vendors, vendorRw, rwUnits, scope };
}

// Task P4.3.06, docs/PRD.md FR-ADMIN-06: one page of products from `?q=&sort=&page=&status=&category=&rw=`. Entry is
// the UMKM managers', the superadmin (decision of 2026-10-24) and the Kopdes admin (A30); an RW admin reads their own
// RW's products and vendors (effectiveRw).
export default async function ProductsPage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await requireDashboardStaff(ALL_STAFF_ROLES);
  if (!ctx) return null;
  const params = await searchParams;
  const canManage = isUmkmManager(ctx);
  const { result, vendors, vendorRw, rwUnits, scope } = await loadProducts(ctx, params);
  const facets = listFacets(canManage, {
    status: contentStatusFacet(text.facets.status),
    others: [CATEGORY_FACET],
    rw: rwFacet(text.facets.rw, rwUnits),
  });
  const actions = (
    <HeaderActions
      canManage={canManage}
      rwName={rwUnits.find((unit) => unit.id === vendorRw)?.name ?? null}
      vendors={vendors}
      vendorsOpen={params[VENDORS_OPEN_PARAM] === VENDORS_OPEN_VALUE}
    />
  );

  return (
    <>
      <DashboardPageHeader title={text.title} description={text.description} action={actions} />
      {ctx.role === 'admin_kopdes' ? <KopdesRwChoice scope={scope} rws={rwUnits} /> : null}
      {canManage ? null : <FormAlert tone="info">{text.readOnly}</FormAlert>}
      <ProductTable
        rows={result.rows}
        total={result.total}
        facets={facets}
        archiveAction={canManage ? archiveProductAction : null}
      />
    </>
  );
}
