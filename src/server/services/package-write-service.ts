import 'server-only';

import type { RwId } from '@/config/rw';
import type { Json } from '@/db/types';
import { copy } from '@/lib/copy/id';
import { AppError } from '@/lib/errors';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { planTierWrites, tiersOverlap, type StoredTier } from '@/lib/utils/package-tiers';
import type {
  PackageValues,
  PriceTierValues,
  UpdatePackageValues,
} from '@/lib/validations/package';
import type { StaffContext } from '@/server/auth/guards';
import { rowOrNotFound } from '@/server/services/content-errors';
import { removeFilesOrLog } from '@/server/services/content-files';
import { packageErrorOr, readPackageForStaff } from '@/server/services/package-service';
import { keepRowPhotos } from '@/server/services/upload-service';
import type { CleanedUp } from '@/types/cms';
import type { PackageAdmin } from '@/types/package';

// Package writes through the session client (Task P4.3.05, docs/PRD.md FR-ADMIN-05, REC-13, REC-14). The triggers
// write an RW package's single leg, keep a combo the superadmin's and off sale until it visits two RWs, hold the price
// floor and record every price change. A combo's legs are not written here: 0005 grants no API role the columns an
// upsert of a leg sets, so they wait for the save_package RPC (Task P4.3.11), which also makes a save atomic. Until
// then the tiers go first, in an order that never trips the exclusion index, and the package columns after them.
// Prices are integer rupiah as typed; nothing here computes a total (CLAUDE.md §7.1).

type Supabase = Awaited<ReturnType<typeof createSupabaseServerClient>>;

function itineraryJson(values: PackageValues): Json {
  return values.itinerary.map((step, index) => ({
    order: index + 1,
    rw_id: step.rwId,
    time: step.time,
    title: step.title,
    description: step.description,
  }));
}

function columnsOf(values: PackageValues, updatedBy: string) {
  return {
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
    updated_by: updatedBy,
  };
}

function tierColumns(tier: { minPax: number; maxPax: number | null; pricePerPax: number }) {
  return { min_pax: tier.minPax, max_pax: tier.maxPax, price_per_pax: tier.pricePerPax };
}

async function updateTier(supabase: Supabase, packageId: string, tier: StoredTier) {
  const { error } = await supabase
    .from('tour_package_price_tiers')
    .update(tierColumns(tier))
    .eq('id', tier.id)
    .eq('package_id', packageId)
    .select('id')
    .single();
  if (error) throw packageErrorOr(error);
}

// Deletes, then narrowed tiers, then widened ones and new ones (planTierWrites), so a valid final set never overlaps
// mid-way. The set is checked first, before anything is written.
async function syncTiers(
  packageId: string,
  tiers: PriceTierValues[],
  stored: readonly StoredTier[],
) {
  if (tiersOverlap(tiers)) throw new AppError('CONFLICT', copy.packages.errors.tierOverlap);
  const plan = planTierWrites(stored, tiers);
  const supabase = await createSupabaseServerClient();
  for (const id of plan.deletes) {
    const { error } = await supabase
      .from('tour_package_price_tiers')
      .delete()
      .eq('id', id)
      .eq('package_id', packageId);
    if (error) throw packageErrorOr(error);
  }
  for (const tier of [...plan.shrinks, ...plan.grows]) await updateTier(supabase, packageId, tier);
  for (const tier of plan.inserts) {
    const row = { package_id: packageId, ...tierColumns(tier) };
    const { error } = await supabase.from('tour_package_price_tiers').insert(row);
    if (error) throw packageErrorOr(error);
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

// owner: the RW of an RW package, null for a combo (tour_packages_owner_ok). The row needs its id before its tiers.
export async function createPackage(
  ctx: StaffContext,
  owner: RwId | null,
  values: PackageValues,
): Promise<PackageAdmin> {
  if (tiersOverlap(values.priceTiers)) {
    throw new AppError('CONFLICT', copy.packages.errors.tierOverlap);
  }
  const row = {
    rw_id: owner,
    category: values.category,
    created_by: ctx.userId,
    ...columnsOf(values, ctx.userId),
  };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from('tour_packages').insert(row).select('id').single();
  if (error) throw packageErrorOr(error);
  await syncTiers(data.id, values.priceTiers, []);
  return rowOrNotFound(await readPackageForStaff(data.id));
}

// Tiers first: a refused tier leaves the package's own columns and price as they were.
export async function updatePackage(
  ctx: StaffContext,
  current: PackageAdmin,
  values: UpdatePackageValues,
): Promise<CleanedUp<PackageAdmin>> {
  await syncTiers(values.id, values.priceTiers, current.priceTiers);
  // Every column is named by columnsOf; the category travels with them (a combo stays the superadmin's, trigger).
  const columns = { category: values.category, ...columnsOf(values, ctx.userId) };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from('tour_packages').update(columns).eq('id', values.id);
  if (error) throw packageErrorOr(error);
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
