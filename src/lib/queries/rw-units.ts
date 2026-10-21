import 'server-only';

import type { Tables } from '@/db/types';
import { toPublicImage } from '@/lib/queries/mappers';
import { cachedPublicRead, rowOrNull, rowsOf } from '@/lib/queries/public-read';
import { TAGS } from '@/lib/queries/tags';
import { createSupabaseAnonClient } from '@/lib/supabase/anon';
import {
  RW_UNIT_SUMMARY_COLUMNS,
  toRwUnitSummary,
  type RwUnitSummaryRow,
} from '@/lib/utils/rw-units';
import type { RwUnitProfile } from '@/types/rw-unit';

const RW_UNIT_COLUMNS = `${RW_UNIT_SUMMARY_COLUMNS}, theme_label, tagline, description_md, vision_md, hero_image_path, contact_phone, contact_email, map_lat, map_lng, products_heading`;

type RwUnitRow = RwUnitSummaryRow &
  Pick<
    Tables<'rw_units'>,
    | 'theme_label'
    | 'tagline'
    | 'description_md'
    | 'vision_md'
    | 'hero_image_path'
    | 'contact_phone'
    | 'contact_email'
    | 'map_lat'
    | 'map_lng'
    | 'products_heading'
  >;

function toRwUnitProfile(row: RwUnitRow): RwUnitProfile {
  return {
    ...toRwUnitSummary(row),
    themeLabel: row.theme_label,
    tagline: row.tagline,
    descriptionMd: row.description_md,
    visionMd: row.vision_md,
    heroImage: toPublicImage(row.hero_image_path, row.name),
    contactPhone: row.contact_phone,
    contactEmail: row.contact_email,
    mapLat: row.map_lat,
    mapLng: row.map_lng,
    productsHeading: row.products_heading,
  };
}

// Active RWs only: the public policy hides an inactive one. The order is the kelurahan's (rw_units.sort_order), which
// the menu, the home page and the filters follow.
export const listRwUnits = cachedPublicRead(
  async (): Promise<RwUnitProfile[]> => {
    const result = await createSupabaseAnonClient()
      .from('rw_units')
      .select(RW_UNIT_COLUMNS)
      .order('sort_order')
      .order('id');
    return rowsOf(result, 'rw_units').map(toRwUnitProfile);
  },
  ['rw-units', 'list'],
  [TAGS.rwUnits],
);

export const getRwUnitBySlug = cachedPublicRead(
  async (slug: string): Promise<RwUnitProfile | null> => {
    const result = await createSupabaseAnonClient()
      .from('rw_units')
      .select(RW_UNIT_COLUMNS)
      .eq('slug', slug)
      .maybeSingle();
    const row = rowOrNull(result, 'rw_units');
    return row ? toRwUnitProfile(row) : null;
  },
  ['rw-units', 'by-slug'],
  [TAGS.rwUnits],
);
