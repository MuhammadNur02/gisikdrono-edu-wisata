import 'server-only';

import type { Tables } from '@/db/types';
import { toPublicImage, toPublicImages } from '@/lib/queries/mappers';
import { cachedPublicRead, rowOrNull, rowsOf } from '@/lib/queries/public-read';
import { listRwUnits } from '@/lib/queries/rw-units';
import { getSiteSetting } from '@/lib/queries/settings';
import { TAGS } from '@/lib/queries/tags';
import { createSupabaseAnonClient } from '@/lib/supabase/anon';
import { productPriceOf } from '@/lib/utils/product-price';
import { rwBadgeFor } from '@/lib/utils/rw-units';
import type { AddonProduct, ProductDetail, ProductSummary, ProductVariant } from '@/types/product';
import type { RwBadge } from '@/types/rw-unit';

// Decision of 2026-10-29 (20261105160300, 20261105160600): who makes a product is no public information, so no read
// here names a vendor: anon holds nothing of umkm_vendors, nor products_umkm.vendor_id. Decision of 2026-10-30
// (catalogue.show_product_prices): while the switch is off, productPriceOf turns every price into `hidden` here,
// before the result is cached, so no amount reaches a page, its RSC payload, the JSON-LD or the OG image. The reads
// cache under the settings tag too, so turning the switch shows or hides the prices at once.
const SUMMARY_COLUMNS =
  'id, slug, name, category, rw_id, price, unit_label, is_available, is_featured, image_paths, product_variants(id)';
const DETAIL_COLUMNS = `${SUMMARY_COLUMNS}, description_md, min_order_qty, max_order_qty, lead_time_days, variants:product_variants(id, label, image_path, sort_order, is_available)`;

const ADDON_COLUMNS =
  'id, rw_id, name, unit_label, price, min_order_qty, max_order_qty, lead_time_days, image_paths';

const PRODUCT_TAGS = [TAGS.allProducts, TAGS.rwUnits, TAGS.settings];

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
> & { product_variants: { id: string }[] };

type VariantRow = Pick<
  Tables<'product_variants'>,
  'id' | 'label' | 'image_path' | 'sort_order' | 'is_available'
>;

type ProductDetailRow = ProductRow &
  Pick<
    Tables<'products_umkm'>,
    'description_md' | 'min_order_qty' | 'max_order_qty' | 'lead_time_days'
  > & { variants: VariantRow[] };

interface PublicCatalogue {
  units: readonly RwBadge[];
  showsPrices: boolean;
}

function toProductSummary(row: ProductRow, catalogue: PublicCatalogue): ProductSummary {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    category: row.category,
    rw: rwBadgeFor(row.rw_id, catalogue.units),
    price: productPriceOf(row.price, catalogue.showsPrices),
    unitLabel: row.unit_label,
    isAvailable: row.is_available,
    isFeatured: row.is_featured,
    cover: toPublicImages(row.image_paths, row.name)[0] ?? null,
    variantCount: row.product_variants.length,
  };
}

type AddonRow = Pick<
  Tables<'products_umkm'>,
  | 'id'
  | 'rw_id'
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
// 2026-10-29 no product is an add-on, so the list is empty until add-ons return. A product without a price is never
// one (products_umkm_addon_has_price); were one read anyway, it is left out, so the quote finds it unavailable rather
// than free.
function toAddonProduct(row: AddonRow, units: readonly RwBadge[]): AddonProduct[] {
  if (row.price === null) return [];
  return [
    {
      id: row.id,
      rw: rwBadgeFor(row.rw_id, units),
      name: row.name,
      unitLabel: row.unit_label,
      price: row.price,
      minOrderQty: row.min_order_qty,
      maxOrderQty: row.max_order_qty,
      leadTimeDays: row.lead_time_days,
      cover: toPublicImages(row.image_paths, row.name)[0] ?? null,
    },
  ];
}

// The variants in the product's order, each photo described by the product and the variant.
function toProductVariants(rows: readonly VariantRow[], productName: string): ProductVariant[] {
  return [...rows]
    .sort((left, right) => left.sort_order - right.sort_order)
    .map((row) => ({
      id: row.id,
      label: row.label,
      image: toPublicImage(row.image_path, `${productName}, ${row.label}`),
      isAvailable: row.is_available,
    }));
}

function toProductDetail(row: ProductDetailRow, catalogue: PublicCatalogue): ProductDetail {
  return {
    ...toProductSummary(row, catalogue),
    descriptionMd: row.description_md,
    minOrderQty: row.min_order_qty,
    maxOrderQty: row.max_order_qty,
    leadTimeDays: row.lead_time_days,
    images: toPublicImages(row.image_paths, row.name),
    variants: toProductVariants(row.variants, row.name),
  };
}

async function publicCatalogue(): Promise<PublicCatalogue> {
  const [units, showsPrices] = await Promise.all([
    listRwUnits(),
    getSiteSetting('showProductPrices'),
  ]);
  return { units, showsPrices };
}

// Published products only; pages filter by RW, category or add-on eligibility in memory.
export const listProducts = cachedPublicRead(
  async (): Promise<ProductSummary[]> => {
    const [result, catalogue] = await Promise.all([
      createSupabaseAnonClient()
        .from('products_umkm')
        .select(SUMMARY_COLUMNS)
        .order('sort_order')
        .order('name'),
      publicCatalogue(),
    ]);
    return rowsOf(result, 'products_umkm').map((row) => toProductSummary(row, catalogue));
  },
  ['products', 'list'],
  PRODUCT_TAGS,
);

// docs/PRD.md FR-BOOK-04: every product on sale as an add-on, of any RW; the wizard keeps those of its package's RWs.
// The booking quote prices from these rows, so the price switch of the public pages never masks them.
export const listAddonProducts = cachedPublicRead(
  async (): Promise<AddonProduct[]> => {
    const [result, units] = await Promise.all([
      createSupabaseAnonClient()
        .from('products_umkm')
        .select(ADDON_COLUMNS)
        .eq('is_addon_eligible', true)
        .eq('is_available', true)
        .not('price', 'is', null)
        .order('sort_order')
        .order('name'),
      listRwUnits(),
    ]);
    return rowsOf(result, 'products_umkm').flatMap((row) => toAddonProduct(row, units));
  },
  ['products', 'addons'],
  [TAGS.allProducts, TAGS.rwUnits],
);

export const getProductBySlug = cachedPublicRead(
  async (slug: string): Promise<ProductDetail | null> => {
    const [result, catalogue] = await Promise.all([
      createSupabaseAnonClient()
        .from('products_umkm')
        .select(DETAIL_COLUMNS)
        .eq('slug', slug)
        .maybeSingle(),
      publicCatalogue(),
    ]);
    const row = rowOrNull(result, 'products_umkm');
    return row ? toProductDetail(row, catalogue) : null;
  },
  ['products', 'by-slug'],
  PRODUCT_TAGS,
);
