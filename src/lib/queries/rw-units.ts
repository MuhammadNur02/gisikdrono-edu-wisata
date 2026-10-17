import 'server-only';

import type { Tables } from '@/db/types';
import { toPublicImage, toRwId } from '@/lib/queries/mappers';
import { cachedPublicRead, rowOrNull, rowsOf } from '@/lib/queries/public-read';
import { TAGS } from '@/lib/queries/tags';
import { createSupabaseAnonClient } from '@/lib/supabase/anon';
import type { RwUnitProfile } from '@/types/rw-unit';

const RW_UNIT_COLUMNS =
  'id, code, slug, name, theme_label, tagline, description_md, vision_md, hero_image_path, contact_phone, contact_email, map_lat, map_lng';

type RwUnitRow = Pick<
  Tables<'rw_units'>,
  | 'id'
  | 'code'
  | 'slug'
  | 'name'
  | 'theme_label'
  | 'tagline'
  | 'description_md'
  | 'vision_md'
  | 'hero_image_path'
  | 'contact_phone'
  | 'contact_email'
  | 'map_lat'
  | 'map_lng'
>;

function toRwUnitProfile(row: RwUnitRow): RwUnitProfile {
  return {
    id: toRwId(row.id),
    code: row.code,
    slug: row.slug,
    name: row.name,
    themeLabel: row.theme_label,
    tagline: row.tagline,
    descriptionMd: row.description_md,
    visionMd: row.vision_md,
    heroImage: toPublicImage(row.hero_image_path, row.name),
    contactPhone: row.contact_phone,
    contactEmail: row.contact_email,
    mapLat: row.map_lat,
    mapLng: row.map_lng,
  };
}

// Active RWs only: the public policy hides an inactive one.
export const listRwUnits = cachedPublicRead(
  async (): Promise<RwUnitProfile[]> => {
    const result = await createSupabaseAnonClient()
      .from('rw_units')
      .select(RW_UNIT_COLUMNS)
      .order('sort_order');
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
