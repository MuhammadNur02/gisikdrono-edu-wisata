import 'server-only';

import { ARTICLE_DEFAULT_SORT, ARTICLE_SORT_COLUMNS, type ArticleIntent } from '@/config/cms';
import type { RwId } from '@/config/rw';
import { DB_ENUMS, type EnumValue } from '@/db/enums';
import type { Tables } from '@/db/types';
import { copy } from '@/lib/copy/id';
import { AppError } from '@/lib/errors';
import { sanitiseRichText, type RichTextBlock } from '@/lib/rich-text/document';
import { estimateReadingMinutes } from '@/lib/rich-text/reading-time';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { isPublishedImagePathFor } from '@/lib/uploads/paths';
import { allowedValue, planContentList } from '@/lib/utils/content-list';
import type { ListQuery } from '@/lib/utils/list-query';
import type { SaveArticleValues } from '@/lib/validations/article';
import type { StaffContext } from '@/server/auth/guards';
import { archivedRowOr, rowOrNotFound, slugConflictOr } from '@/server/services/content-errors';
import { removeFilesOrLog } from '@/server/services/content-files';
import { keepRowPhotos, removeRowPhotos } from '@/server/services/upload-service';
import type { ArticleAdmin, ArticleListItem, CleanedUp } from '@/types/cms';
import type { ContentOwner } from '@/types/content';
import type { ListResult } from '@/types/data-table';

// Articles through the session client, so the articles policies (author_id = auth.uid() on insert, delete for the
// superadmin alone), articles_moderation_guard (only the superadmin publishes; an RW admin's edit of a live article
// goes back to review, 0004) and the AAL2 policy decide. Every write names the owner as well as the id.

const LIST_COLUMNS = 'id, rw_id, slug, title, category, status, published_at, updated_at';
const COLUMNS =
  'id, rw_id, slug, title, excerpt, body_json, cover_path, category, tags, status, seo_title, seo_description';

type ArticleRow = Pick<
  Tables<'articles'>,
  | 'id'
  | 'rw_id'
  | 'slug'
  | 'title'
  | 'excerpt'
  | 'body_json'
  | 'cover_path'
  | 'category'
  | 'tags'
  | 'status'
  | 'seo_title'
  | 'seo_description'
>;

const STATUS_BY_INTENT: Record<ArticleIntent, EnumValue<'content_status'>> = {
  draft: 'draft',
  review: 'pending_review',
  publish: 'published',
};

function toArticleAdmin(row: ArticleRow): ArticleAdmin {
  return {
    id: row.id,
    owner: row.rw_id,
    slug: row.slug,
    title: row.title,
    excerpt: row.excerpt,
    bodyJson: row.body_json,
    coverPath: row.cover_path,
    category: row.category,
    tags: row.tags,
    status: row.status,
    seoTitle: row.seo_title,
    seoDescription: row.seo_description,
  };
}

function imagesIn(blocks: RichTextBlock[]): string[] {
  return blocks.flatMap((block) => {
    if (block.type === 'image') return [block.path];
    if (block.type === 'blockquote') return imagesIn(block.content);
    if (block.type === 'bulletList' || block.type === 'orderedList')
      return block.items.flatMap(imagesIn);
    return [];
  });
}

// Every photo the page will show lies in this article's own folder of its owner: the cover, and each image the
// allowlist keeps from the body. An officer cannot hang another RW's photo on their article.
function photosOf(values: SaveArticleValues): string[] {
  const cover = values.coverPath === null ? [] : [values.coverPath];
  return [...cover, ...imagesIn(sanitiseRichText(values.bodyJson))];
}

function photoFolderOf(owner: ContentOwner, id: string) {
  return { rwId: owner, purpose: 'article' as const, entityId: id };
}

function checkImages(owner: ContentOwner, values: SaveArticleValues): void {
  const target = photoFolderOf(owner, values.id);
  if (!photosOf(values).every((path) => isPublishedImagePathFor(path, target))) {
    throw new AppError('VALIDATION', copy.cms.validation.image);
  }
}

// The article's folder keeps only the cover and body photos it shows (docs/Security.md R34): a photo taken out of the
// body, a replaced cover, or an upload the editor left unused goes in the same action.
async function keepOnlyArticlePhotos(
  ctx: StaffContext,
  owner: ContentOwner,
  values: SaveArticleValues,
  saved: ArticleAdmin,
): Promise<CleanedUp<ArticleAdmin>> {
  const filesRemoved = await removeFilesOrLog('article_files', values.id, () =>
    keepRowPhotos(ctx, photoFolderOf(owner, values.id), photosOf(values)),
  );
  return { value: saved, filesRemoved };
}

// Finding 1 of the review of PR #18 (decision of 2026-10-21): an RW admin's change to a published article goes back
// to review by the database's own rule (articles_moderation_guard), so the service names no status for it.
function isUnderReviewRule(ctx: StaffContext, current: ArticleAdmin): boolean {
  return ctx.role !== 'superadmin' && current.status === 'published';
}

function contentColumnsOf(values: SaveArticleValues) {
  return {
    slug: values.slug,
    title: values.title,
    excerpt: values.excerpt,
    body_json: values.bodyJson,
    cover_path: values.coverPath,
    category: values.category,
    tags: values.tags,
    seo_title: values.seoTitle,
    seo_description: values.seoDescription,
    reading_minutes: estimateReadingMinutes(values.bodyJson),
  };
}

// One page of articles from the URL's query (Task P4.3.03): an RW admin's own RW, the superadmin's chosen one or
// every row RLS shows them (effectiveRw), searched by title.
export async function listArticlesForStaff(
  query: ListQuery,
  rw: RwId | null,
): Promise<ListResult<ArticleListItem>> {
  const plan = planContentList(query, rw, {
    columns: ARTICLE_SORT_COLUMNS,
    fallback: ARTICLE_DEFAULT_SORT,
  });
  const supabase = await createSupabaseServerClient();
  let request = supabase.from('articles').select(LIST_COLUMNS, { count: 'exact' });
  if (plan.pattern !== null) request = request.ilike('title', plan.pattern);
  if (plan.statuses.length > 0) request = request.in('status', plan.statuses);
  const category = allowedValue(query.category, DB_ENUMS.article_category);
  if (category !== null) request = request.eq('category', category);
  if (plan.rw !== null) request = request.eq('rw_id', plan.rw);
  if (plan.order !== null) {
    request = request.order(plan.order.column, { ascending: plan.order.ascending });
  }
  const { data, error, count } = await request.order('id').range(plan.from, plan.to);
  if (error) throw error;
  const rows = data.map((row) => ({
    id: row.id,
    owner: row.rw_id,
    slug: row.slug,
    title: row.title,
    category: row.category,
    status: row.status,
    updatedAt: row.updated_at,
  }));
  return { rows, total: count ?? rows.length };
}

// Archive by status (Task P4.3.03): off the site, kept here with its photos. articles_moderation_guard still refuses an
// RW admin who takes a published article off the site.
export async function archiveArticle(owner: ContentOwner, id: string): Promise<void> {
  const supabase = await createSupabaseServerClient();
  let query = supabase.from('articles').update({ status: 'archived' }).eq('id', id);
  query = owner === null ? query.is('rw_id', null) : query.eq('rw_id', owner);
  const { data, error } = await query.select('id').maybeSingle();
  if (error) throw error;
  rowOrNotFound(data);
}

// An article this staff member may see (articles_staff_read), or null: another RW's reads as unknown.
export async function readArticleForStaff(id: string): Promise<ArticleAdmin | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('articles')
    .select(COLUMNS)
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data ? toArticleAdmin(data) : null;
}

export async function createArticle(
  ctx: StaffContext,
  owner: ContentOwner,
  values: SaveArticleValues,
): Promise<CleanedUp<ArticleAdmin>> {
  checkImages(owner, values);
  // Every column is named here; the id is the form's, the owner the action's, the author the signed-in staff
  // member.
  const row = {
    id: values.id,
    rw_id: owner,
    author_id: ctx.userId,
    status: STATUS_BY_INTENT[values.intent],
    ...contentColumnsOf(values),
  };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from('articles').insert(row).select(COLUMNS).single();
  if (error) throw slugConflictOr(error);
  return keepOnlyArticlePhotos(ctx, owner, values, toArticleAdmin(data));
}

export async function updateArticle(
  ctx: StaffContext,
  owner: ContentOwner,
  values: SaveArticleValues,
  current: ArticleAdmin,
): Promise<CleanedUp<ArticleAdmin>> {
  checkImages(owner, values);
  const columns = isUnderReviewRule(ctx, current)
    ? contentColumnsOf(values)
    : { status: STATUS_BY_INTENT[values.intent], ...contentColumnsOf(values) };
  const supabase = await createSupabaseServerClient();
  let query = supabase.from('articles').update(columns).eq('id', values.id);
  query = owner === null ? query.is('rw_id', null) : query.eq('rw_id', owner);
  const { data, error } = await query.select(COLUMNS).maybeSingle();
  if (error) throw slugConflictOr(error);
  return keepOnlyArticlePhotos(ctx, owner, values, toArticleAdmin(rowOrNotFound(data)));
}

// The article takes its whole folder along, cover and body photos alike (content-files.ts says in which order).
export async function removeArticle(
  ctx: StaffContext,
  owner: ContentOwner,
  id: string,
): Promise<boolean> {
  const supabase = await createSupabaseServerClient();
  let query = supabase.from('articles').delete().eq('id', id).eq('status', 'archived');
  query = owner === null ? query.is('rw_id', null) : query.eq('rw_id', owner);
  const { data, error } = await query.select('id').maybeSingle();
  if (error) throw error;
  archivedRowOr(data);
  return removeFilesOrLog('article_files', id, () =>
    removeRowPhotos(ctx, photoFolderOf(owner, id)),
  );
}
