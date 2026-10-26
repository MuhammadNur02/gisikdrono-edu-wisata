import 'server-only';

import type { RwId } from '@/config/rw';
import { savePackage } from '@/db/rpc-catalog';
import type { Json } from '@/db/types';
import { packagesCopy } from '@/lib/copy/packages';
import { AppError } from '@/lib/errors';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { tiersOverlap } from '@/lib/utils/package-tiers';
import type { PackageValues, UpdatePackageValues } from '@/lib/validations/package';
import type { StaffContext } from '@/server/auth/guards';
import { rowOrNotFound } from '@/server/services/content-errors';
import { removeFilesOrLog } from '@/server/services/content-files';
import { packageErrorOr, readPackageForStaff } from '@/server/services/package-service';
import { keepRowPhotos } from '@/server/services/upload-service';
import type { CleanedUp } from '@/types/cms';
import type { PackageAdmin } from '@/types/package';

// Package writes through save_package (Task P4.3.05, P4.3.11; docs/PRD.md FR-ADMIN-05, REC-13, REC-14): the package,
// its tiers and its status in one transaction on the session client, so the grants, policies and triggers decide as
// they did for the direct writes before it: an RW package keeps its single leg, a combo stays the superadmin's and off
// sale until it visits two RWs, the price floor holds and every price change is recorded. A combo sends its route in
// order; an RW package, or a combo whose route is still empty, sends none and keeps what is saved. Prices are integer rupiah as typed; nothing here computes
// a total (CLAUDE.md §7.1).

function itineraryJson(values: PackageValues): Json {
  return values.itinerary.map((step, index) => ({
    order: index + 1,
    rw_id: step.rwId,
    time: step.time,
    title: step.title,
    description: step.description,
  }));
}

// Every field save_package takes but rw_id, which only a new package names.
function fieldsOf(values: PackageValues & { category: string }): Record<string, Json> {
  return {
    category: values.category,
    slug: values.slug,
    name: values.name,
    tagline: values.tagline,
    description_md: values.descriptionMd,
    highlights: values.highlights,
    inclusions: values.inclusions,
    itinerary: itineraryJson(values),
    duration_minutes: values.durationMinutes,
    pricing_basis: values.pricingBasis,
    price_per_pax: values.pricePerPax,
    flat_price: values.flatPrice,
    min_pax: values.minPax,
    max_pax: values.maxPax,
    image_paths: values.imagePaths,
    is_featured: values.isFeatured,
    status: values.status,
    sort_order: values.sortOrder,
    valid_from: values.validFrom,
    valid_to: values.validTo,
  };
}

// save_package_legs takes a combo's RWs in order, and refuses an empty route; null keeps the legs saved so far.
function legsToSave(values: PackageValues): number[] | null {
  return values.category === 'combo' && values.legRwIds.length > 0 ? values.legRwIds : null;
}

async function save(
  packageId: string | null,
  fields: Record<string, Json>,
  values: PackageValues,
): Promise<string> {
  if (tiersOverlap(values.priceTiers)) {
    throw new AppError('CONFLICT', packagesCopy.errors.tierOverlap);
  }
  try {
    const supabase = await createSupabaseServerClient();
    return await savePackage(supabase, {
      packageId,
      fields,
      legRwIds: legsToSave(values),
      tiers: values.priceTiers,
    });
  } catch (error) {
    throw error instanceof Error ? packageErrorOr(error) : error;
  }
}

// The package's folder keeps only the photos it shows (docs/Security.md R34).
async function keepOnlyPackagePhotos(
  ctx: StaffContext,
  pkg: PackageAdmin,
): Promise<CleanedUp<PackageAdmin>> {
  const target = { rwId: pkg.rwId, purpose: 'package' as const, entityId: pkg.id };
  const filesRemoved = await removeFilesOrLog('package_files', pkg.id, () =>
    keepRowPhotos(ctx, target, pkg.imagePaths),
  );
  return { value: pkg, filesRemoved };
}

// owner: the RW of an RW package, null for a combo (tour_packages_owner_ok).
export async function createPackage(
  owner: RwId | null,
  values: PackageValues,
): Promise<PackageAdmin> {
  const id = await save(null, { ...fieldsOf(values), rw_id: owner }, values);
  return rowOrNotFound(await readPackageForStaff(id));
}

// The category travels with the other columns (a combo stays the superadmin's, trigger).
export async function updatePackage(
  ctx: StaffContext,
  values: UpdatePackageValues,
): Promise<CleanedUp<PackageAdmin>> {
  await save(values.id, fieldsOf(values), values);
  return keepOnlyPackagePhotos(ctx, rowOrNotFound(await readPackageForStaff(values.id)));
}

// Archive by status, never delete (decision of 2026-10-16): bookings keep pointing at the package.
export async function archivePackage(ctx: StaffContext, id: string): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('tour_packages')
    .update({ status: 'archived', updated_by: ctx.userId })
    .eq('id', id)
    .select('id')
    .maybeSingle();
  if (error) throw error;
  rowOrNotFound(data);
}
