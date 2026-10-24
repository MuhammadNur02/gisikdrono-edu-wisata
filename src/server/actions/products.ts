'use server';

import { revalidateTag } from 'next/cache';

import type { RwId } from '@/config/rw';
import { productsCopy } from '@/lib/copy/products';
import { fail, mapError, ok, okUnlessFilesLeft } from '@/lib/errors';
import { TAGS } from '@/lib/queries/tags';
import { rowRefSchema } from '@/lib/validations/content';
import { createProductSchema, updateProductSchema } from '@/lib/validations/product';
import { requireRwContentOwner } from '@/server/auth/content-owner';
import { requireAal2, type GuardResult } from '@/server/auth/guards';
import {
  archiveProduct,
  createProduct,
  readProductForStaff,
  updateProduct,
} from '@/server/services/product-service';
import { readVendorForStaff } from '@/server/services/vendor-service';
import type { ActionFailure, ActionResult } from '@/types/action-result';
import type { ProductAdmin } from '@/types/product';

// /dashboard/products (Task P4.3.06, docs/PRD.md FR-ADMIN-06, REC-13). Entry is the superadmin's (decision of the
// user, 2026-10-24): an RW admin reads their own RW's products and changes none. Only this guard says so for now: the
// products_umkm and umkm_vendors write policies of 0005 still let an RW admin write their own RW's rows, and narrowing
// them to is_superadmin() is a migration (Task P4.3.11). A new product belongs to the RW the RwSwitcher points at,
// never to one a form names, and its vendor has to be of that RW, which products_umkm_vendor_rw_guard checks again.

const text = productsCopy;

async function requireSuperadmin(): Promise<GuardResult> {
  const guard = await requireAal2();
  if (!guard.ok) return guard;
  return guard.ctx.role === 'superadmin'
    ? guard
    : fail('FORBIDDEN', undefined, text.entryOnlySuper);
}

async function refusedVendor(vendorId: string, rwId: RwId): Promise<ActionFailure | null> {
  const vendor = await readVendorForStaff(vendorId);
  if (vendor?.rwId === rwId) return null;
  return fail('VALIDATION', { vendorId: [text.vendorWrongRw] }, text.vendorWrongRw);
}

export async function createProductAction(input: unknown): Promise<ActionResult<ProductAdmin>> {
  const parsed = createProductSchema.safeParse(input);
  if (!parsed.success) return mapError(parsed.error);
  const guard = await requireSuperadmin();
  if (!guard.ok) return guard;
  const target = await requireRwContentOwner(guard.ctx);
  if (!target.ok) return target;

  try {
    const refused = await refusedVendor(parsed.data.vendorId, target.rwId);
    if (refused) return refused;
    const created = await createProduct(guard.ctx, target.rwId, parsed.data);
    revalidateTag(TAGS.allProducts);
    return ok(created);
  } catch (error) {
    return mapError(error);
  }
}

export async function updateProductAction(input: unknown): Promise<ActionResult<ProductAdmin>> {
  const parsed = updateProductSchema.safeParse(input);
  if (!parsed.success) return mapError(parsed.error);
  const guard = await requireSuperadmin();
  if (!guard.ok) return guard;

  try {
    const current = await readProductForStaff(parsed.data.id);
    if (!current) return fail('NOT_FOUND');
    const refused = await refusedVendor(parsed.data.vendorId, current.rwId);
    if (refused) return refused;
    const saved = await updateProduct(guard.ctx, current, parsed.data);
    revalidateTag(TAGS.allProducts);
    return okUnlessFilesLeft(saved);
  } catch (error) {
    return mapError(error);
  }
}

// Archive by status, never delete: booking add-ons keep pointing at the product.
export async function archiveProductAction(input: unknown): Promise<ActionResult<null>> {
  const parsed = rowRefSchema.safeParse(input);
  if (!parsed.success) return mapError(parsed.error);
  const guard = await requireSuperadmin();
  if (!guard.ok) return guard;

  try {
    await archiveProduct(parsed.data.id);
    revalidateTag(TAGS.allProducts);
    return ok(null);
  } catch (error) {
    return mapError(error);
  }
}
