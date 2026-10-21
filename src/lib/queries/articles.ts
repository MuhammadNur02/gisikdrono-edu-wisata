import 'server-only';

import type { Tables } from '@/db/types';
import { toPublicImage } from '@/lib/queries/mappers';
import { cachedPublicRead, rowOrNull, rowsOf } from '@/lib/queries/public-read';
import { listRwUnits } from '@/lib/queries/rw-units';
import { TAGS } from '@/lib/queries/tags';
import { estimateReadingMinutes } from '@/lib/rich-text/reading-time';
import { createSupabaseAnonClient } from '@/lib/supabase/anon';
import { rwBadgeFor } from '@/lib/utils/rw-units';
import type { ArticleDetail, ArticleSummary } from '@/types/article';
import type { RwBadge } from '@/types/rw-unit';

const SUMMARY_COLUMNS =
  'id, slug, title, excerpt, category, rw_id, tags, cover_path, published_at, reading_minutes';
const DETAIL_COLUMNS = `${SUMMARY_COLUMNS}, body_json, seo_title, seo_description, updated_at`;

type ArticleRow = Pick<
  Tables<'articles'>,
  | 'id'
  | 'slug'
  | 'title'
  | 'excerpt'
  | 'category'
  | 'rw_id'
  | 'tags'
  | 'cover_path'
  | 'published_at'
  | 'reading_minutes'
>;

type ArticleDetailRow = ArticleRow &
  Pick<Tables<'articles'>, 'body_json' | 'seo_title' | 'seo_description' | 'updated_at'>;

function toArticleSummary(row: ArticleRow, units: readonly RwBadge[]): ArticleSummary {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    excerpt: row.excerpt,
    category: row.category,
    rw: row.rw_id === null ? null : rwBadgeFor(row.rw_id, units),
    tags: row.tags,
    cover: toPublicImage(row.cover_path, row.title),
    publishedAt: row.published_at,
    readingMinutes: row.reading_minutes,
  };
}

function toArticleDetail(row: ArticleDetailRow, units: readonly RwBadge[]): ArticleDetail {
  return {
    ...toArticleSummary(row, units),
    readingMinutes: row.reading_minutes ?? estimateReadingMinutes(row.body_json),
    body: row.body_json,
    seoTitle: row.seo_title,
    seoDescription: row.seo_description,
    updatedAt: row.updated_at,
  };
}

// Published articles, newest first.
export const listArticles = cachedPublicRead(
  async (): Promise<ArticleSummary[]> => {
    const [result, units] = await Promise.all([
      createSupabaseAnonClient()
        .from('articles')
        .select(SUMMARY_COLUMNS)
        .order('published_at', { ascending: false, nullsFirst: false }),
      listRwUnits(),
    ]);
    return rowsOf(result, 'articles').map((row) => toArticleSummary(row, units));
  },
  ['articles', 'list'],
  [TAGS.articles, TAGS.rwUnits],
);

export const getArticleBySlug = cachedPublicRead(
  async (slug: string): Promise<ArticleDetail | null> => {
    const [result, units] = await Promise.all([
      createSupabaseAnonClient()
        .from('articles')
        .select(DETAIL_COLUMNS)
        .eq('slug', slug)
        .maybeSingle(),
      listRwUnits(),
    ]);
    const row = rowOrNull(result, 'articles');
    return row ? toArticleDetail(row, units) : null;
  },
  ['articles', 'by-slug'],
  [TAGS.articles, TAGS.rwUnits],
);
