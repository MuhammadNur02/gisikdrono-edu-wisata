import 'server-only';

import type { Tables } from '@/db/types';
import { toOptionalRwId, toPublicImage } from '@/lib/queries/mappers';
import { cachedPublicRead, rowOrNull, rowsOf } from '@/lib/queries/public-read';
import { TAGS } from '@/lib/queries/tags';
import { createSupabaseAnonClient } from '@/lib/supabase/anon';
import type { ArticleDetail, ArticleSummary } from '@/types/article';

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

function toArticleSummary(row: ArticleRow): ArticleSummary {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    excerpt: row.excerpt,
    category: row.category,
    rwId: toOptionalRwId(row.rw_id),
    tags: row.tags,
    cover: toPublicImage(row.cover_path, row.title),
    publishedAt: row.published_at,
    readingMinutes: row.reading_minutes,
  };
}

function toArticleDetail(row: ArticleDetailRow): ArticleDetail {
  return {
    ...toArticleSummary(row),
    body: row.body_json,
    seoTitle: row.seo_title,
    seoDescription: row.seo_description,
    updatedAt: row.updated_at,
  };
}

// Published articles, newest first.
export const listArticles = cachedPublicRead(
  async (): Promise<ArticleSummary[]> => {
    const result = await createSupabaseAnonClient()
      .from('articles')
      .select(SUMMARY_COLUMNS)
      .order('published_at', { ascending: false, nullsFirst: false });
    return rowsOf(result, 'articles').map(toArticleSummary);
  },
  ['articles', 'list'],
  [TAGS.articles],
);

export const getArticleBySlug = cachedPublicRead(
  async (slug: string): Promise<ArticleDetail | null> => {
    const result = await createSupabaseAnonClient()
      .from('articles')
      .select(DETAIL_COLUMNS)
      .eq('slug', slug)
      .maybeSingle();
    const row = rowOrNull(result, 'articles');
    return row ? toArticleDetail(row) : null;
  },
  ['articles', 'by-slug'],
  [TAGS.articles],
);
