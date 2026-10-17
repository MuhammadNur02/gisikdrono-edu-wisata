import 'server-only';

import type { Tables } from '@/db/types';
import { toPublicImage } from '@/lib/queries/mappers';
import { cachedPublicRead, rowsOf } from '@/lib/queries/public-read';
import { TAGS } from '@/lib/queries/tags';
import { createSupabaseAnonClient } from '@/lib/supabase/anon';
import type { HeroBanner } from '@/types/banner';

const BANNER_COLUMNS =
  'id, title, subtitle, cta_label, cta_href, image_path, mobile_image_path, products_umkm(slug)';

type BannerRow = Pick<
  Tables<'hero_banners'>,
  'id' | 'title' | 'subtitle' | 'cta_label' | 'cta_href' | 'image_path' | 'mobile_image_path'
> & { products_umkm: Pick<Tables<'products_umkm'>, 'slug'> | null };

function toHeroBanner(row: BannerRow): HeroBanner | null {
  // hero_banners has no alt text of its own; the title says what the slide is about.
  const image = toPublicImage(row.image_path, row.title);
  if (!image) return null;
  return {
    id: row.id,
    title: row.title,
    subtitle: row.subtitle,
    ctaLabel: row.cta_label,
    ctaHref: row.cta_href,
    image,
    mobileImage: toPublicImage(row.mobile_image_path, row.title),
    productSlug: row.products_umkm?.slug ?? null,
  };
}

// Active banners inside their window (hero_banners_public_read). The window is checked when the cache
// fills, so a banner can start or end up to an hour late unless its edit revalidates `banners`.
export const listHeroBanners = cachedPublicRead(
  async (): Promise<HeroBanner[]> => {
    const result = await createSupabaseAnonClient()
      .from('hero_banners')
      .select(BANNER_COLUMNS)
      .order('sort_order');
    return rowsOf(result, 'hero_banners').flatMap((row) => toHeroBanner(row) ?? []);
  },
  ['banners', 'list'],
  [TAGS.banners],
);
