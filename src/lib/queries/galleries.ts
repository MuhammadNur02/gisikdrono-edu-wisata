import 'server-only';

import { RW_IDS } from '@/config/rw';
import type { EnumValue } from '@/db/enums';
import type { Tables } from '@/db/types';
import { toOptionalRwId, toPublicImage } from '@/lib/queries/mappers';
import { cachedPublicRead, rowsOf } from '@/lib/queries/public-read';
import { TAGS, type GalleryOwner } from '@/lib/queries/tags';
import { createSupabaseAnonClient } from '@/lib/supabase/anon';
import type { GalleryItem, GalleryPage } from '@/types/gallery';

// docs/StyleGuide.md §5.11: 24 items a page, the next page behind `Muat lagi`.
export const GALLERY_PAGE_SIZE = 24;

const GALLERY_COLUMNS =
  'id, rw_id, category, media_type, storage_path, thumbnail_path, video_url, width, height, blurhash, caption, alt_text, taken_at';

const ALL_GALLERY_TAGS = [
  ...RW_IDS.map((rwId) => TAGS.galleries(rwId)),
  TAGS.galleries('kelurahan'),
];

export interface GalleryFilter {
  owner?: GalleryOwner;
  category?: EnumValue<'gallery_category'>;
}

type GalleryRow = Pick<
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

function toGalleryItem(row: GalleryRow): GalleryItem | null {
  const stillPath = row.media_type === 'video' ? row.thumbnail_path : row.storage_path;
  const image = toPublicImage(stillPath, row.alt_text, row);
  // A video without a still has nothing the grid can show.
  if (!image) return null;
  return {
    id: row.id,
    rwId: toOptionalRwId(row.rw_id),
    category: row.category,
    mediaType: row.media_type,
    image,
    caption: row.caption,
    videoUrl: row.video_url,
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
  const tags = filter.owner === undefined ? ALL_GALLERY_TAGS : [TAGS.galleries(filter.owner)];
  return cachedPublicRead(readGalleryPage, ['galleries', 'page'], tags)(filter, page);
}
