import 'server-only';

import type { Tables } from '@/db/types';
import { toOptionalRwId, toPublicImage } from '@/lib/queries/mappers';
import { cachedPublicRead, rowOrNull, rowsOf } from '@/lib/queries/public-read';
import { TAGS } from '@/lib/queries/tags';
import { createSupabaseAnonClient } from '@/lib/supabase/anon';
import { bookletPagePaths } from '@/lib/uploads/paths';
import type { BookletDetail, BookletDownload, BookletSummary } from '@/types/booklet';

const SUMMARY_COLUMNS =
  'id, slug, title, description, kind, rw_id, cover_path, page_count, file_size_bytes, published_at';
const DETAIL_COLUMNS = `${SUMMARY_COLUMNS}, pdf_path, page_images_prefix`;

type BookletRow = Pick<
  Tables<'booklets'>,
  | 'id'
  | 'slug'
  | 'title'
  | 'description'
  | 'kind'
  | 'rw_id'
  | 'cover_path'
  | 'page_count'
  | 'file_size_bytes'
  | 'published_at'
>;

type BookletDetailRow = BookletRow & Pick<Tables<'booklets'>, 'pdf_path' | 'page_images_prefix'>;

function toBookletSummary(row: BookletRow): BookletSummary {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    description: row.description,
    kind: row.kind,
    rwId: toOptionalRwId(row.rw_id),
    cover: toPublicImage(row.cover_path, `Sampul ${row.title}`),
    pageCount: row.page_count,
    fileSizeBytes: row.file_size_bytes,
    publishedAt: row.published_at,
  };
}

// Published booklets, newest first.
export const listBooklets = cachedPublicRead(
  async (): Promise<BookletSummary[]> => {
    const result = await createSupabaseAnonClient()
      .from('booklets')
      .select(SUMMARY_COLUMNS)
      .order('published_at', { ascending: false, nullsFirst: false });
    return rowsOf(result, 'booklets').map(toBookletSummary);
  },
  ['booklets', 'list'],
  [TAGS.booklets],
);

export const getBookletBySlug = cachedPublicRead(
  async (slug: string): Promise<BookletDetail | null> => {
    const result = await createSupabaseAnonClient()
      .from('booklets')
      .select(DETAIL_COLUMNS)
      .eq('slug', slug)
      .maybeSingle();
    const row: BookletDetailRow | null = rowOrNull(result, 'booklets');
    if (!row) return null;
    return {
      ...toBookletSummary(row),
      pdfPath: row.pdf_path,
      pagePaths: bookletPagePaths(row.page_images_prefix, row.page_count),
    };
  },
  ['booklets', 'by-slug'],
  [TAGS.booklets],
);

// What GET /api/documents/booklet/[id] needs to hand out the PDF. The anon policy answers for published
// booklets only, so a draft or archived id reads as unknown.
export const getBookletDownload = cachedPublicRead(
  async (id: string): Promise<BookletDownload | null> => {
    const result = await createSupabaseAnonClient()
      .from('booklets')
      .select('id, slug, pdf_path')
      .eq('id', id)
      .maybeSingle();
    const row = rowOrNull(result, 'booklets');
    return row ? { id: row.id, slug: row.slug, pdfPath: row.pdf_path } : null;
  },
  ['booklets', 'download'],
  [TAGS.booklets],
);
