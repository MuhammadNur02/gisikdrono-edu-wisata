import 'server-only';

import type { EnumValue } from '@/db/enums';
import type { Tables } from '@/db/types';
import { toPublicImage } from '@/lib/queries/mappers';
import { cachedPublicRead, rowsOf } from '@/lib/queries/public-read';
import { TAGS, type GalleryOwner } from '@/lib/queries/tags';
import { createSupabaseAnonClient } from '@/lib/supabase/anon';
import { youtubeVideoId } from '@/lib/utils/youtube';
import type { GalleryItem, GalleryPage, GalleryPages } from '@/types/gallery';

// docs/StyleGuide.md §5.11: 24 items a page, the next page behind `Muat lagi`.
export const GALLERY_PAGE_SIZE = 24;

const GALLERY_COLUMNS =
  'id, rw_id, category, media_type, storage_path, thumbnail_path, video_url, width, height, blurhash, caption, alt_text, taken_at';

export interface GalleryFilter {
  owner?: GalleryOwner;
  category?: EnumValue<'gallery_category'>;
}

export type GalleryRow = Pick<
  Tables<'galleries'>,
  | 'id'
  | 'rw_id'
  | 'category'
  | 'media_type'
  | 'storage_path'
  | 'thumbnail_path'
  | 'video_url'
  | 'width'
  | 'height'
  | 'blurhash'
  | 'caption'
  | 'alt_text'
  | 'taken_at'
>;

function toVideoItem(row: GalleryRow) {
  const youtubeId = youtubeVideoId(row.video_url);
  // A video whose address holds no usable id has nothing to play, so the gallery leaves it out.
  if (!youtubeId) return null;
  return { youtubeId, image: toPublicImage(row.thumbnail_path, row.alt_text, row) };
}

export function toGalleryItem(row: GalleryRow): GalleryItem | null {
  const media =
    row.media_type === 'video'
      ? toVideoItem(row)
      : { youtubeId: null, image: toPublicImage(row.storage_path, row.alt_text, row) };
  if (!media) return null;
  return {
    id: row.id,
    rwId: row.rw_id,
    category: row.category,
    mediaType: row.media_type,
    alt: row.alt_text,
    ...media,
    caption: row.caption,
    takenAt: row.taken_at,
  };
}

async function readGalleryPage(filter: GalleryFilter, page: number): Promise<GalleryPage> {
  const firstIndex = (page - 1) * GALLERY_PAGE_SIZE;
  // One row past the page tells whether a next page exists without counting the table.
  let query = createSupabaseAnonClient()
    .from('galleries')
    .select(GALLERY_COLUMNS)
    .order('sort_order')
    .order('created_at', { ascending: false })
    .order('id')
    .range(firstIndex, firstIndex + GALLERY_PAGE_SIZE);
  if (filter.owner === 'kelurahan') query = query.is('rw_id', null);
  else if (filter.owner !== undefined) query = query.eq('rw_id', filter.owner);
  if (filter.category !== undefined) query = query.eq('category', filter.category);

  const rows = rowsOf(await query, 'galleries');
  return {
    items: rows.slice(0, GALLERY_PAGE_SIZE).flatMap((row) => toGalleryItem(row) ?? []),
    hasMore: rows.length > GALLERY_PAGE_SIZE,
  };
}

// Published items only (galleries_public_read). `page` starts at 1.
export function listGalleryPage(filter: GalleryFilter = {}, page = 1): Promise<GalleryPage> {
  if (!Number.isInteger(page) || page < 1) throw new RangeError(`gallery page ${String(page)}`);
  const tags = filter.owner === undefined ? [TAGS.allGalleries] : [TAGS.galleries(filter.owner)];
  return cachedPublicRead(readGalleryPage, ['galleries', 'page'], tags)(filter, page);
}

// /galeri renders every page up to `lastPage` (already capped by GALLERY_MAX_PAGES), stopping where the
// gallery ends. Pages load one after another so that end is found without reading past it.
export async function listGalleryPages(
  filter: GalleryFilter,
  lastPage: number,
): Promise<GalleryPages> {
  const items: GalleryItem[] = [];
  let pageCount = 0;
  let hasMore = true;
  while (hasMore && pageCount < lastPage) {
    pageCount += 1;
    const page = await listGalleryPage(filter, pageCount);
    items.push(...page.items);
    hasMore = page.hasMore;
  }
  return { items, hasMore, pageCount };
}
