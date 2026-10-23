import 'server-only';

import { PACKAGE_DEFAULT_SORT, PACKAGE_SORT_COLUMNS } from '@/config/packages';
import { DB_ENUMS } from '@/db/enums';
import type { Tables } from '@/db/types';
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
import { slugConflictOr } from '@/server/services/content-errors';
import type { ListResult } from '@/types/data-table';
import type { PackageAdmin, PackageListItem } from '@/types/package';

// Package reads through the session client (Task P4.3.05, docs/PRD.md FR-ADMIN-05, REC-13, REC-14): the tour_packages
// policies decide who reads what (an RW admin reads their own RW's packages and the combos that visit it). The writes
// are in package-write-service.ts.

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
