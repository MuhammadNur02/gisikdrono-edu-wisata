import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { ProductForm } from '@/components/admin/products/product-form';
import { productValues } from '@/components/admin/products/product-values';
import { BackLink } from '@/components/admin/shell/back-link';
import { DashboardPageHeader } from '@/components/admin/shell/dashboard-page-header';
import { ContentStatusBadge } from '@/components/admin/status/status-badge';
import { PRODUCT_PATHS } from '@/config/products';
import { copy } from '@/lib/copy/id';
import { rowIdSchema } from '@/lib/validations/content';
import { updateProductAction } from '@/server/actions/products';
import { requireDashboardStaff } from '@/server/auth/session';
import { readProductForStaff } from '@/server/services/product-service';
import { listVendorsForStaff } from '@/server/services/vendor-service';

const text = copy.products;

export const metadata: Metadata = { title: text.editTitle };

interface EditProductPageProps {
  params: Promise<{ id: string }>;
}

// Task P4.3.06, docs/PRD.md FR-ADMIN-06. RLS shows an RW admin their own RW's products only, so another RW's product
// answers 404, like one that does not exist; their own opens read-only (decision of 2026-10-24).
export default async function EditProductPage({ params }: EditProductPageProps) {
  const ctx = await requireDashboardStaff();
  if (!ctx) return null;
  const id = rowIdSchema.safeParse((await params).id);
  const product = id.success ? await readProductForStaff(id.data) : null;
  if (!product) notFound();
  const vendors = await listVendorsForStaff(product.rwId);

  return (
    <>
      <BackLink href={PRODUCT_PATHS.list} label={text.back} />
      <DashboardPageHeader
        title={product.name}
        action={<ContentStatusBadge status={product.status} />}
      />
      <ProductForm
        initial={productValues(product)}
        action={updateProductAction}
        stored={{ id: product.id, rwId: product.rwId }}
        vendors={vendors.map((vendor) => ({ value: vendor.id, label: vendor.name }))}
        readOnly={ctx.role !== 'superadmin'}
      />
    </>
  );
}
