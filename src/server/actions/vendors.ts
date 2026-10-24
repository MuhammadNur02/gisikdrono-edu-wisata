'use server';

import { revalidateTag } from 'next/cache';

import { productsCopy } from '@/lib/copy/products';
import { fail, mapError, ok } from '@/lib/errors';
import { TAGS } from '@/lib/queries/tags';
import { createVendorSchema, updateVendorSchema } from '@/lib/validations/product';
import { requireRwContentOwner } from '@/server/auth/content-owner';
import { requireAal2, type GuardResult } from '@/server/auth/guards';
import { createVendor, updateVendor } from '@/server/services/vendor-service';
import type { ActionResult } from '@/types/action-result';
import type { VendorAdmin } from '@/types/vendor';

// The vendors sheet of /dashboard/products (Task P4.3.06, docs/PRD.md FR-ADMIN-06). Entry is the superadmin's
// (decision of the user, 2026-10-24), which only this guard enforces until the RLS narrowing of Task P4.3.11; a new
// vendor belongs to the RW the RwSwitcher points at. The bank and consent columns wait for their superadmin RPCs
// (P4.3.06, a migration) and are part of no form here.

async function requireSuperadmin(): Promise<GuardResult> {
  const guard = await requireAal2();
  if (!guard.ok) return guard;
  return guard.ctx.role === 'superadmin'
    ? guard
    : fail('FORBIDDEN', undefined, productsCopy.entryOnlySuper);
}

export async function createVendorAction(input: unknown): Promise<ActionResult<VendorAdmin>> {
  const parsed = createVendorSchema.safeParse(input);
  if (!parsed.success) return mapError(parsed.error);
  const guard = await requireSuperadmin();
  if (!guard.ok) return guard;
  const target = await requireRwContentOwner(guard.ctx);
  if (!target.ok) return target;

  try {
    const vendor = await createVendor(guard.ctx, target.rwId, parsed.data);
    revalidateTag(TAGS.allProducts);
    return ok(vendor);
  } catch (error) {
    return mapError(error);
  }
}

export async function updateVendorAction(input: unknown): Promise<ActionResult<VendorAdmin>> {
  const parsed = updateVendorSchema.safeParse(input);
  if (!parsed.success) return mapError(parsed.error);
  const guard = await requireSuperadmin();
  if (!guard.ok) return guard;

  try {
    const vendor = await updateVendor(parsed.data);
    revalidateTag(TAGS.allProducts);
    return ok(vendor);
  } catch (error) {
    return mapError(error);
  }
}
