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
  // hero_banners has no alt text of its own. The subtitle, when there is one, says what the photo shows
  // (docs/StyleGuide.md §1.3 G8); otherwise the title says what the slide is about.
  const alt = row.subtitle ?? row.title;
  const image = toPublicImage(row.image_path, alt);
  if (!image) return null;
  return {
    id: row.id,
    title: row.title,
    subtitle: row.subtitle,
    ctaLabel: row.cta_label,
    ctaHref: row.cta_href,
    image,
    mobileImage: toPublicImage(row.mobile_image_path, alt),
    productSlug: row.products_umkm?.slug ?? null,
  };
}

// Active banners inside their window (hero_banners_public_read). The window is checked when the cache
// fills, so a banner can start or end up to an hour late unless its edit revalidates `banners`. The order is the
// dashboard's (sort_order, then newest first, readBannerOrder), so a move there is the move here.
export const listHeroBanners = cachedPublicRead(
  async (): Promise<HeroBanner[]> => {
    const result = await createSupabaseAnonClient()
      .from('hero_banners')
      .select(BANNER_COLUMNS)
      .order('sort_order')
      .order('created_at', { ascending: false });
    return rowsOf(result, 'hero_banners').flatMap((row) => toHeroBanner(row) ?? []);
  },
  ['banners', 'list'],
  [TAGS.banners],
);
