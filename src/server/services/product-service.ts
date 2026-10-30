import 'server-only';

import { PRODUCT_DEFAULT_SORT, PRODUCT_SORT_COLUMNS } from '@/config/products';
import type { RwId } from '@/config/rw';
import { DB_ENUMS } from '@/db/enums';
import { saveProduct } from '@/db/rpc-catalog';
import type { Json, Tables } from '@/db/types';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import {
  allowedValues,
  pageRange,
  parseSort,
  searchPattern,
  type ListQuery,
} from '@/lib/utils/list-query';
import type { ProductValues, UpdateProductValues } from '@/lib/validations/product';
import type { StaffContext } from '@/server/auth/guards';
import { rowOrNotFound, slugConflictOr } from '@/server/services/content-errors';
import { removeFilesOrLog } from '@/server/services/content-files';
import { keepRowPhotos } from '@/server/services/upload-service';
import type { CleanedUp } from '@/types/cms';
import type { ListResult } from '@/types/data-table';
import type { ProductAdmin, ProductListItem, ProductVariantAdmin } from '@/types/product';

// UMKM products through the session client (Task P4.3.06, docs/PRD.md FR-ADMIN-06, REC-13): products_umkm_staff_read
// shows staff their own RW's products, products_umkm_vendor_rw_guard keeps a product in its vendor's RW, and the
// media trigger keeps its photos in its own folder. Prices are integer rupiah as typed (CLAUDE.md §7.1), or none yet
// (decision of 2026-10-30). save_product writes the row and then its variants in one transaction, so a photo the row
// just took off has already left its variants (products_umkm_variant_photos) and one it just added may be picked.

const LIST_COLUMNS =
  'id, rw_id, vendor_id, slug, name, category, price, unit_label, status, is_addon_eligible, is_available, is_featured, updated_at, umkm_vendors(name)';
const DETAIL_COLUMNS = `${LIST_COLUMNS}, description_md, min_order_qty, max_order_qty, lead_time_days, image_paths, sort_order, product_variants(label, image_path, is_available, sort_order)`;

type ListRow = Pick<
  Tables<'products_umkm'>,
  | 'id'
  | 'rw_id'
  | 'vendor_id'
  | 'slug'
  | 'name'
  | 'category'
  | 'price'
  | 'unit_label'
  | 'status'
  | 'is_addon_eligible'
  | 'is_available'
  | 'is_featured'
  | 'updated_at'
> & { umkm_vendors: { name: string } | null };

type DetailRow = ListRow &
  Pick<
    Tables<'products_umkm'>,
    | 'description_md'
    | 'min_order_qty'
    | 'max_order_qty'
    | 'lead_time_days'
    | 'image_paths'
    | 'sort_order'
  > & {
    product_variants: Pick<
      Tables<'product_variants'>,
      'label' | 'image_path' | 'is_available' | 'sort_order'
    >[];
  };

function toVariantsAdmin(rows: DetailRow['product_variants']): ProductVariantAdmin[] {
  return [...rows]
    .sort((left, right) => left.sort_order - right.sort_order)
    .map((row) => ({ label: row.label, imagePath: row.image_path, isAvailable: row.is_available }));
}

function toListItem(row: ListRow): ProductListItem {
  return {
    id: row.id,
    rwId: row.rw_id,
    vendorId: row.vendor_id,
    vendorName: row.umkm_vendors?.name ?? '',
    slug: row.slug,
    name: row.name,
    category: row.category,
    price: row.price,
    unitLabel: row.unit_label,
    status: row.status,
    isAddonEligible: row.is_addon_eligible,
    isAvailable: row.is_available,
    isFeatured: row.is_featured,
    updatedAt: row.updated_at,
  };
}

function toProductAdmin(row: DetailRow): ProductAdmin {
  return {
    ...toListItem(row),
    descriptionMd: row.description_md,
    minOrderQty: row.min_order_qty,
    maxOrderQty: row.max_order_qty,
    leadTimeDays: row.lead_time_days,
    imagePaths: row.image_paths,
    sortOrder: row.sort_order,
    variants: toVariantsAdmin(row.product_variants),
  };
}

export async function listProductsForStaff(query: ListQuery): Promise<ListResult<ProductListItem>> {
  const supabase = await createSupabaseServerClient();
  const order =
    parseSort(query.sort, PRODUCT_SORT_COLUMNS) ??
    parseSort(PRODUCT_DEFAULT_SORT, PRODUCT_SORT_COLUMNS);
  const { from, to } = pageRange(query.page, query.per);
  let request = supabase.from('products_umkm').select(LIST_COLUMNS, { count: 'exact' });
  const pattern = searchPattern(query.q);
  if (pattern !== null) request = request.ilike('name', pattern);
  const statuses = allowedValues(query.status, DB_ENUMS.content_status);
  if (statuses.length > 0) request = request.in('status', statuses);
  const [category] = allowedValues(
    query.category ? [query.category] : [],
    DB_ENUMS.product_category,
  );
  if (category !== undefined) request = request.eq('category', category);
  if (query.rw !== null) request = request.eq('rw_id', query.rw);
  if (order !== null) request = request.order(order.column, { ascending: order.ascending });
  const { data, error, count } = await request.order('name').range(from, to);
  if (error) throw error;
  return { rows: data.map(toListItem), total: count ?? data.length };
}

export async function readProductForStaff(id: string): Promise<ProductAdmin | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('products_umkm')
    .select(DETAIL_COLUMNS)
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data ? toProductAdmin(data) : null;
}

function columnsOf(values: ProductValues) {
  return {
    vendor_id: values.vendorId,
    slug: values.slug,
    name: values.name,
    category: values.category,
    description_md: values.descriptionMd,
    price: values.price,
    unit_label: values.unitLabel,
    min_order_qty: values.minOrderQty,
    max_order_qty: values.maxOrderQty,
    lead_time_days: values.leadTimeDays,
    is_addon_eligible: values.isAddonEligible,
    is_available: values.isAvailable,
    is_featured: values.isFeatured,
    image_paths: values.imagePaths,
    status: values.status,
    sort_order: values.sortOrder,
  };
}

// save_product writes the row and replaces its variants in one transaction (review of PR #115, L1).
async function save(productId: string | null, fields: Record<string, Json>, values: ProductValues) {
  try {
    const supabase = await createSupabaseServerClient();
    return await saveProduct(supabase, { productId, fields, variants: values.variants });
  } catch (error) {
    throw error instanceof Error ? slugConflictOr(error) : error;
  }
}

export async function createProduct(rwId: RwId, values: ProductValues): Promise<ProductAdmin> {
  const id = await save(null, { rw_id: rwId, ...columnsOf(values) }, values);
  return rowOrNotFound(await readProductForStaff(id));
}

// The product's folder keeps only the photos it shows (docs/Security.md R34).
export async function updateProduct(
  ctx: StaffContext,
  current: ProductAdmin,
  values: UpdateProductValues,
): Promise<CleanedUp<ProductAdmin>> {
  await save(values.id, columnsOf(values), values);
  const saved = rowOrNotFound(await readProductForStaff(values.id));
  const target = { rwId: current.rwId, purpose: 'product' as const, entityId: saved.id };
  const filesRemoved = await removeFilesOrLog('product_files', saved.id, () =>
    keepRowPhotos(ctx, target, saved.imagePaths),
  );
  return { value: saved, filesRemoved };
}

// Archive by status, never delete: booking add-ons keep pointing at the product.
export async function archiveProduct(id: string): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('products_umkm')
    .update({ status: 'archived' })
    .eq('id', id)
    .select('id')
    .maybeSingle();
  if (error) throw error;
  rowOrNotFound(data);
}
