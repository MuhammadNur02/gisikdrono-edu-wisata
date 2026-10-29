import 'server-only';

import type { Tables } from '@/db/types';
import { toPublicImages } from '@/lib/queries/mappers';
import { cachedPublicRead, rowOrNull, rowsOf } from '@/lib/queries/public-read';
import { listRwUnits } from '@/lib/queries/rw-units';
import { TAGS } from '@/lib/queries/tags';
import { createSupabaseAnonClient } from '@/lib/supabase/anon';
import { rwBadgeFor } from '@/lib/utils/rw-units';
import type { AddonProduct, ProductDetail, ProductSummary } from '@/types/product';
import type { RwBadge } from '@/types/rw-unit';

// Decision of 2026-10-29 (20261105160300): who makes a product is no public information, so no read here names a
// vendor; anon holds nothing of umkm_vendors.
const SUMMARY_COLUMNS =
  'id, slug, name, category, rw_id, price, unit_label, is_available, is_featured, image_paths';
const DETAIL_COLUMNS = `${SUMMARY_COLUMNS}, description_md, min_order_qty, max_order_qty, lead_time_days`;

const ADDON_COLUMNS =
  'id, rw_id, vendor_id, name, unit_label, price, min_order_qty, max_order_qty, lead_time_days, image_paths';

const PRODUCT_TAGS = [TAGS.allProducts, TAGS.rwUnits];

type ProductRow = Pick<
  Tables<'products_umkm'>,
  | 'id'
  | 'slug'
  | 'name'
  | 'category'
  | 'rw_id'
  | 'price'
  | 'unit_label'
  | 'is_available'
  | 'is_featured'
  | 'image_paths'
>;

type ProductDetailRow = ProductRow &
  Pick<
    Tables<'products_umkm'>,
    'description_md' | 'min_order_qty' | 'max_order_qty' | 'lead_time_days'
  >;

function toProductSummary(row: ProductRow, units: readonly RwBadge[]): ProductSummary {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    category: row.category,
    rw: rwBadgeFor(row.rw_id, units),
    price: row.price,
    unitLabel: row.unit_label,
    isAvailable: row.is_available,
    isFeatured: row.is_featured,
    cover: toPublicImages(row.image_paths, row.name)[0] ?? null,
  };
}

type AddonRow = Pick<
  Tables<'products_umkm'>,
  | 'id'
  | 'rw_id'
  | 'vendor_id'
  | 'name'
  | 'unit_label'
  | 'price'
  | 'min_order_qty'
  | 'max_order_qty'
  | 'lead_time_days'
  | 'image_paths'
>;

// The public no longer sees the vendor, so a product whose vendor stopped selling is offered like any other and
// internal.booking_quote refuses it, as it always did (independent review of PR #26, L5). Since the decision of
// 2026-10-29 no product is an add-on, so the list is empty until add-ons return.
function toAddonProduct(row: AddonRow, units: readonly RwBadge[]): AddonProduct {
  return {
    id: row.id,
    vendorId: row.vendor_id,
    rw: rwBadgeFor(row.rw_id, units),
    name: row.name,
    unitLabel: row.unit_label,
    price: row.price,
    minOrderQty: row.min_order_qty,
    maxOrderQty: row.max_order_qty,
    leadTimeDays: row.lead_time_days,
    cover: toPublicImages(row.image_paths, row.name)[0] ?? null,
  };
}

function toProductDetail(row: ProductDetailRow, units: readonly RwBadge[]): ProductDetail {
  return {
    ...toProductSummary(row, units),
    descriptionMd: row.description_md,
    minOrderQty: row.min_order_qty,
    maxOrderQty: row.max_order_qty,
    leadTimeDays: row.lead_time_days,
    images: toPublicImages(row.image_paths, row.name),
  };
}

// Published products only; pages filter by RW, category or add-on eligibility in memory.
export const listProducts = cachedPublicRead(
  async (): Promise<ProductSummary[]> => {
    const [result, units] = await Promise.all([
      createSupabaseAnonClient()
        .from('products_umkm')
        .select(SUMMARY_COLUMNS)
        .order('sort_order')
        .order('name'),
      listRwUnits(),
    ]);
    return rowsOf(result, 'products_umkm').map((row) => toProductSummary(row, units));
  },
  ['products', 'list'],
  PRODUCT_TAGS,
);

// docs/PRD.md FR-BOOK-04: every product on sale as an add-on, of any RW; the wizard keeps those of its package's RWs.
export const listAddonProducts = cachedPublicRead(
  async (): Promise<AddonProduct[]> => {
    const [result, units] = await Promise.all([
      createSupabaseAnonClient()
        .from('products_umkm')
        .select(ADDON_COLUMNS)
        .eq('is_addon_eligible', true)
        .eq('is_available', true)
        .order('sort_order')
        .order('name'),
      listRwUnits(),
    ]);
    return rowsOf(result, 'products_umkm').map((row) => toAddonProduct(row, units));
  },
  ['products', 'addons'],
  PRODUCT_TAGS,
);

export const getProductBySlug = cachedPublicRead(
  async (slug: string): Promise<ProductDetail | null> => {
    const [result, units] = await Promise.all([
      createSupabaseAnonClient()
        .from('products_umkm')
        .select(DETAIL_COLUMNS)
        .eq('slug', slug)
        .maybeSingle(),
      listRwUnits(),
    ]);
    const row = rowOrNull(result, 'products_umkm');
    return row ? toProductDetail(row, units) : null;
  },
  ['products', 'by-slug'],
  PRODUCT_TAGS,
);
