import 'server-only';

import type { Tables } from '@/db/types';
import { toPublicImage, toRwId } from '@/lib/queries/mappers';
import { PRODUCT_TAGS } from '@/lib/queries/products';
import { cachedPublicRead, rowOrNull, rowsOf } from '@/lib/queries/public-read';
import { createSupabaseAnonClient } from '@/lib/supabase/anon';
import type { VendorProfile } from '@/types/vendor';

// The registry has no vendor tag: a vendor shows on its products' pages and is edited from the products
// screen, which revalidates products:<rwId> (Task P4.3.06).
const VENDOR_COLUMNS = 'id, rw_id, slug, name, description_md, logo_path';

type VendorRow = Pick<
  Tables<'umkm_vendors'>,
  'id' | 'rw_id' | 'slug' | 'name' | 'description_md' | 'logo_path'
>;

function toVendorProfile(row: VendorRow): VendorProfile {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    rwId: toRwId(row.rw_id),
    descriptionMd: row.description_md,
    logo: toPublicImage(row.logo_path, `Logo ${row.name}`),
  };
}

// Active vendors only (umkm_vendors_public_read).
export const listVendors = cachedPublicRead(
  async (): Promise<VendorProfile[]> => {
    const result = await createSupabaseAnonClient()
      .from('umkm_vendors')
      .select(VENDOR_COLUMNS)
      .order('name');
    return rowsOf(result, 'umkm_vendors').map(toVendorProfile);
  },
  ['vendors', 'list'],
  PRODUCT_TAGS,
);

export const getVendorBySlug = cachedPublicRead(
  async (slug: string): Promise<VendorProfile | null> => {
    const result = await createSupabaseAnonClient()
      .from('umkm_vendors')
      .select(VENDOR_COLUMNS)
      .eq('slug', slug)
      .maybeSingle();
    const row = rowOrNull(result, 'umkm_vendors');
    return row ? toVendorProfile(row) : null;
  },
  ['vendors', 'by-slug'],
  PRODUCT_TAGS,
);
