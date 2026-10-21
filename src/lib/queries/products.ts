import 'server-only';

import type { Tables } from '@/db/types';
import { toPublicImages } from '@/lib/queries/mappers';
import { cachedPublicRead, rowOrNull, rowsOf } from '@/lib/queries/public-read';
import { listRwUnits } from '@/lib/queries/rw-units';
import { TAGS } from '@/lib/queries/tags';
import { createSupabaseAnonClient } from '@/lib/supabase/anon';
import { rwBadgeFor } from '@/lib/utils/rw-units';
import type { ProductDetail, ProductSummary } from '@/types/product';
import type { RwBadge } from '@/types/rw-unit';

const SUMMARY_COLUMNS =
  'id, slug, name, category, rw_id, price, unit_label, is_available, is_addon_eligible, is_featured, image_paths, umkm_vendors(slug, name)';
const DETAIL_COLUMNS = `${SUMMARY_COLUMNS}, description_md, min_order_qty, max_order_qty, lead_time_days`;

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
  | 'is_addon_eligible'
  | 'is_featured'
  | 'image_paths'
> & { umkm_vendors: Pick<Tables<'umkm_vendors'>, 'slug' | 'name'> | null };

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
    isAddonEligible: row.is_addon_eligible,
    isFeatured: row.is_featured,
    vendor: row.umkm_vendors,
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
