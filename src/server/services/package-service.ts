import 'server-only';

import { PACKAGE_DEFAULT_SORT, PACKAGE_SORT_COLUMNS } from '@/config/packages';
import type { RwId } from '@/config/rw';
import { DB_ENUMS } from '@/db/enums';
import type { Json, Tables } from '@/db/types';
import { copy } from '@/lib/copy/id';
import { AppError } from '@/lib/errors';
import { parseItinerary } from '@/lib/queries/packages';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import {
  allowedValues,
  pageRange,
  parseSort,
  searchPattern,
  type ListQuery,
} from '@/lib/utils/list-query';
import type {
  PackageValues,
  PriceTierValues,
  UpdatePackageValues,
} from '@/lib/validations/package';
import type { StaffContext } from '@/server/auth/guards';
import { rowOrNotFound, slugConflictOr } from '@/server/services/content-errors';
import { removeFilesOrLog } from '@/server/services/content-files';
import { keepRowPhotos } from '@/server/services/upload-service';
import type { CleanedUp } from '@/types/cms';
import type { ListResult } from '@/types/data-table';
import type { PackageAdmin, PackageListItem } from '@/types/package';

// Packages through the session client (Task P4.3.05, docs/PRD.md FR-ADMIN-05, REC-13, REC-14): the tour_packages
// policies decide who reads and writes (an RW admin reads a combo that visits their RW and edits nothing of it), the
// triggers write the single leg, keep a combo the superadmin's, hold the price floor and record every price change.
// Prices are integer rupiah as typed; nothing here computes a total (CLAUDE.md §7.1).

const LIST_COLUMNS =
  'id, rw_id, slug, name, category, pricing_basis, price_per_pax, flat_price, min_pax, max_pax, status, is_featured, updated_at, tour_package_legs(rw_id, leg_order, duration_minutes, notes)';
const DETAIL_COLUMNS = `${LIST_COLUMNS}, tagline, description_md, highlights, inclusions, itinerary, duration_minutes, image_paths, sort_order, valid_from, valid_to, tour_package_price_tiers(id, min_pax, max_pax, price_per_pax)`;

const CHECK_VIOLATION = '23514';
const EXCLUSION_VIOLATION = '23P01';
const PRICE_FLOOR_CONSTRAINT = 'tour_packages_price_floor';

type LegRow = Pick<
  Tables<'tour_package_legs'>,
  'rw_id' | 'leg_order' | 'duration_minutes' | 'notes'
>;
type TierRow = Pick<
  Tables<'tour_package_price_tiers'>,
  'id' | 'min_pax' | 'max_pax' | 'price_per_pax'
>;

type ListRow = Pick<
  Tables<'tour_packages'>,
  | 'id'
  | 'rw_id'
  | 'slug'
  | 'name'
  | 'category'
  | 'pricing_basis'
  | 'price_per_pax'
  | 'flat_price'
  | 'min_pax'
  | 'max_pax'
  | 'status'
  | 'is_featured'
  | 'updated_at'
> & { tour_package_legs: LegRow[] };

type DetailRow = ListRow &
  Pick<
    Tables<'tour_packages'>,
    | 'tagline'
    | 'description_md'
    | 'highlights'
    | 'inclusions'
    | 'itinerary'
    | 'duration_minutes'
    | 'image_paths'
    | 'sort_order'
    | 'valid_from'
    | 'valid_to'
  > & { tour_package_price_tiers: TierRow[] };

function sortedLegs(row: ListRow): LegRow[] {
  return row.tour_package_legs.toSorted((first, second) => first.leg_order - second.leg_order);
}

function toListItem(row: ListRow): PackageListItem {
  return {
    id: row.id,
    rwId: row.rw_id,
    slug: row.slug,
    name: row.name,
    category: row.category,
    rwIds: sortedLegs(row).map((leg) => leg.rw_id),
    pricingBasis: row.pricing_basis,
    pricePerPax: row.price_per_pax,
    flatPrice: row.flat_price,
    minPax: row.min_pax,
    maxPax: row.max_pax,
    status: row.status,
    isFeatured: row.is_featured,
    updatedAt: row.updated_at,
  };
}

function toPackageAdmin(row: DetailRow): PackageAdmin {
  return {
    ...toListItem(row),
    tagline: row.tagline,
    descriptionMd: row.description_md,
    highlights: row.highlights,
    inclusions: row.inclusions,
    // The public parser reads the same JSON; here the RW stays a number.
    itinerary: parseItinerary(row.itinerary, []).map((step) => ({
      rwId: step.rw?.id ?? null,
      time: step.time,
      title: step.title,
      description: step.description,
    })),
    durationMinutes: row.duration_minutes,
    imagePaths: row.image_paths,
    sortOrder: row.sort_order,
    validFrom: row.valid_from,
    validTo: row.valid_to,
    legs: sortedLegs(row).map((leg) => ({
      rwId: leg.rw_id,
      legOrder: leg.leg_order,
      durationMinutes: leg.duration_minutes,
      notes: leg.notes,
    })),
    priceTiers: row.tour_package_price_tiers
      .map((tier) => ({
        id: tier.id,
        minPax: tier.min_pax,
        maxPax: tier.max_pax,
        pricePerPax: tier.price_per_pax,
      }))
      .toSorted((first, second) => first.minPax - second.minPax),
  };
}

// The price floor and the tiers' exclusion index are business outcomes with their own words; a taken slug too.
export function packageErrorOr<E extends Error & { code?: string }>(error: E): E | AppError {
  if (error.code === CHECK_VIOLATION && error.message.includes(PRICE_FLOOR_CONSTRAINT)) {
    return new AppError('VALIDATION', copy.packages.errors.priceFloor);
  }
  if (error.code === EXCLUSION_VIOLATION) {
    return new AppError('CONFLICT', copy.packages.errors.tierOverlap);
  }
  return slugConflictOr(error);
}

export async function listPackagesForStaff(query: ListQuery): Promise<ListResult<PackageListItem>> {
  const supabase = await createSupabaseServerClient();
  const order =
    parseSort(query.sort, PACKAGE_SORT_COLUMNS) ??
    parseSort(PACKAGE_DEFAULT_SORT, PACKAGE_SORT_COLUMNS);
  const { from, to } = pageRange(query.page, query.per);
  let request = supabase.from('tour_packages').select(LIST_COLUMNS, { count: 'exact' });
  const pattern = searchPattern(query.q);
  if (pattern !== null) request = request.ilike('name', pattern);
  const statuses = allowedValues(query.status, DB_ENUMS.content_status);
  if (statuses.length > 0) request = request.in('status', statuses);
  if (query.rw !== null) request = request.eq('rw_id', query.rw);
  if (order !== null) request = request.order(order.column, { ascending: order.ascending });
  const { data, error, count } = await request.order('name').range(from, to);
  if (error) throw error;
  return { rows: data.map(toListItem), total: count ?? data.length };
}

export async function readPackageForStaff(id: string): Promise<PackageAdmin | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('tour_packages')
    .select(DETAIL_COLUMNS)
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data ? toPackageAdmin(data) : null;
}

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

// A combo's legs are the form's, in its order; an RW package's single leg is the trigger's and stays untouched.
async function syncLegs(packageId: string, values: PackageValues, current: PackageAdmin | null) {
  if (values.category !== 'combo') return;
  const supabase = await createSupabaseServerClient();
  const wanted = values.legs.map((leg, index) => ({
    package_id: packageId,
    rw_id: leg.rwId,
    leg_order: index + 1,
    duration_minutes: leg.durationMinutes,
    notes: leg.notes,
  }));
  const keptRwIds = wanted.map((leg) => leg.rw_id);
  const removed = (current?.legs ?? []).filter((leg) => !keptRwIds.includes(leg.rwId));
  for (const leg of removed) {
    const { error } = await supabase
      .from('tour_package_legs')
      .delete()
      .eq('package_id', packageId)
      .eq('rw_id', leg.rwId);
    if (error) throw error;
  }
  // The order is unique per package, so rows are written one by one, each naming its own RW.
  for (const leg of wanted) {
    const { error } = await supabase
      .from('tour_package_legs')
      .upsert(leg, { onConflict: 'package_id,rw_id' });
    if (error) throw error;
  }
}

// Tiers are matched by id so a repriced tier is one history entry, not a removal and an addition.
async function syncTiers(
  packageId: string,
  tiers: PriceTierValues[],
  current: PackageAdmin | null,
) {
  const supabase = await createSupabaseServerClient();
  const keptIds = tiers.flatMap((tier) => (tier.id === null ? [] : [tier.id]));
  for (const tier of (current?.priceTiers ?? []).filter((tier) => !keptIds.includes(tier.id))) {
    const { error } = await supabase.from('tour_package_price_tiers').delete().eq('id', tier.id);
    if (error) throw packageErrorOr(error);
  }
  for (const tier of tiers) {
    const columns = { min_pax: tier.minPax, max_pax: tier.maxPax, price_per_pax: tier.pricePerPax };
    const { error } =
      tier.id === null
        ? await supabase
            .from('tour_package_price_tiers')
            .insert({ package_id: packageId, ...columns })
        : await supabase.from('tour_package_price_tiers').update(columns).eq('id', tier.id);
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

// owner: the RW of an RW package, null for a combo (tour_packages_owner_ok).
export async function createPackage(
  ctx: StaffContext,
  owner: RwId | null,
  values: PackageValues,
): Promise<PackageAdmin> {
  const row = {
    rw_id: owner,
    category: values.category,
    created_by: ctx.userId,
    ...columnsOf(values, ctx.userId),
  };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from('tour_packages').insert(row).select('id').single();
  if (error) throw packageErrorOr(error);
  await syncLegs(data.id, values, null);
  await syncTiers(data.id, values.priceTiers, null);
  return rowOrNotFound(await readPackageForStaff(data.id));
}

export async function updatePackage(
  ctx: StaffContext,
  current: PackageAdmin,
  values: UpdatePackageValues,
): Promise<CleanedUp<PackageAdmin>> {
  // Every column is named by columnsOf; the category travels with them (a combo stays the superadmin's, trigger).
  const columns = { category: values.category, ...columnsOf(values, ctx.userId) };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from('tour_packages').update(columns).eq('id', values.id);
  if (error) throw packageErrorOr(error);
  await syncLegs(values.id, values, current);
  await syncTiers(values.id, values.priceTiers, current);
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
