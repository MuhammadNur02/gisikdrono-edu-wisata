import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { OwnerNotice } from '@/components/admin/cms/owner-notice';
import { ProductForm } from '@/components/admin/products/product-form';
import { blankProduct } from '@/components/admin/products/product-values';
import { BackLink } from '@/components/admin/shell/back-link';
import { DashboardPageHeader } from '@/components/admin/shell/dashboard-page-header';
import { FormAlert } from '@/components/forms/form-alert';
import { PRODUCT_PATHS } from '@/config/products';
import { copy } from '@/lib/copy/id';
import { createProductAction } from '@/server/actions/products';
import { ownerOfNewContent, readRwScope } from '@/server/auth/content-owner';
import { requireDashboardStaff } from '@/server/auth/session';
import { listVendorsForStaff } from '@/server/services/vendor-service';

const text = copy.products;

export const metadata: Metadata = { title: text.newTitle };

function PageHeading() {
  return (
    <>
      <BackLink href={PRODUCT_PATHS.list} label={text.back} />
      <DashboardPageHeader title={text.newTitle} />
    </>
  );
}

function NoticePage({ message }: { message: string }) {
  return (
    <>
      <PageHeading />
      <FormAlert tone="info">{message}</FormAlert>
    </>
  );
}

// Task P4.3.06, docs/PRD.md FR-ADMIN-06. Only the superadmin registers products (decision of 2026-10-24), for the RW
// the RwSwitcher points at and one of its vendors. Photos come after the first save, once the product has an id.
export default async function NewProductPage() {
  const ctx = await requireDashboardStaff();
  if (!ctx) return null;
  if (ctx.role !== 'superadmin') notFound();
  const rwId = ownerOfNewContent(ctx, await readRwScope()) ?? null;
  if (rwId === null) return <NoticePage message={copy.cms.chooseRw} />;
  const vendors = await listVendorsForStaff(rwId);
  const [firstVendor] = vendors;
  if (firstVendor === undefined) return <NoticePage message={text.noVendors} />;

  return (
    <>
      <PageHeading />
      <OwnerNotice owner={rwId} isSuperadmin />
      <ProductForm
        initial={blankProduct(firstVendor.id)}
        action={createProductAction}
        stored={null}
        vendors={vendors.map((vendor) => ({ value: vendor.id, label: vendor.name }))}
        readOnly={false}
      />
    </>
  );
}
