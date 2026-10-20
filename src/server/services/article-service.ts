import 'server-only';

import type { ArticleIntent } from '@/config/cms';
import type { EnumValue } from '@/db/enums';
import type { Tables } from '@/db/types';
import { copy } from '@/lib/copy/id';
import { AppError } from '@/lib/errors';
import { sanitiseRichText, type RichTextBlock } from '@/lib/rich-text/document';
import { estimateReadingMinutes } from '@/lib/rich-text/reading-time';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { isPublishedImagePathFor } from '@/lib/uploads/paths';
import type { SaveArticleValues } from '@/lib/validations/article';
import { toContentOwner } from '@/server/auth/content-owner';
import type { StaffContext } from '@/server/auth/guards';
import { rowOrNotFound, slugConflictOr } from '@/server/services/content-errors';
import { removeFilesOrLog } from '@/server/services/content-files';
import { removeRowPhotos } from '@/server/services/upload-service';
import type { ArticleAdmin, ArticleListItem } from '@/types/cms';
import type { ContentOwner } from '@/types/content';

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

function ownerOfRow(rwId: number | null): ContentOwner {
  const owner = toContentOwner(rwId);
  if (owner === undefined) throw new Error('article of an unknown RW');
  return owner;
}

function toArticleAdmin(row: ArticleRow): ArticleAdmin {
  return {
    id: row.id,
    owner: ownerOfRow(row.rw_id),
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
function checkImages(owner: ContentOwner, values: SaveArticleValues): void {
  const target = { rwId: owner, purpose: 'article' as const, entityId: values.id };
  const paths = [values.coverPath, ...imagesIn(sanitiseRichText(values.bodyJson))];
  const isOwn = (path: string | null) => path === null || isPublishedImagePathFor(path, target);
  if (!paths.every(isOwn)) throw new AppError('VALIDATION', copy.cms.validation.image);
}

function columnsOf(values: SaveArticleValues) {
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
    status: STATUS_BY_INTENT[values.intent],
  };
}

export async function listArticlesForStaff(
  owner: ContentOwner | 'all',
): Promise<ArticleListItem[]> {
  const supabase = await createSupabaseServerClient();
  let query = supabase.from('articles').select(LIST_COLUMNS);
  if (owner === null) query = query.is('rw_id', null);
  else if (owner !== 'all') query = query.eq('rw_id', owner);
  const { data, error } = await query.order('updated_at', { ascending: false });
  if (error) throw error;
  return data.map((row) => ({
    id: row.id,
    owner: ownerOfRow(row.rw_id),
    slug: row.slug,
    title: row.title,
    category: row.category,
    status: row.status,
    updatedAt: row.updated_at,
  }));
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

export async function readArticleOwner(id: string): Promise<ContentOwner | undefined> {
  return (await readArticleForStaff(id))?.owner;
}

export async function createArticle(
  ctx: StaffContext,
  owner: ContentOwner,
  values: SaveArticleValues,
): Promise<ArticleAdmin> {
  checkImages(owner, values);
  // Every column is named by columnsOf; the id is the form's, the owner the action's, the author the signed-in
  // staff member.
  const row = { id: values.id, rw_id: owner, author_id: ctx.userId, ...columnsOf(values) };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from('articles').insert(row).select(COLUMNS).single();
  if (error) throw slugConflictOr(error);
  return toArticleAdmin(data);
}

export async function updateArticle(
  owner: ContentOwner,
  values: SaveArticleValues,
): Promise<ArticleAdmin> {
  checkImages(owner, values);
  const supabase = await createSupabaseServerClient();
  let query = supabase.from('articles').update(columnsOf(values)).eq('id', values.id);
  query = owner === null ? query.is('rw_id', null) : query.eq('rw_id', owner);
  const { data, error } = await query.select(COLUMNS).maybeSingle();
  if (error) throw slugConflictOr(error);
  return toArticleAdmin(rowOrNotFound(data));
}

// The row goes first, so the public page never shows a missing photo; the article's folder, cover and body photos
// alike, follows through upload-service.ts.
export async function removeArticle(
  ctx: StaffContext,
  owner: ContentOwner,
  id: string,
): Promise<void> {
  const supabase = await createSupabaseServerClient();
  let query = supabase.from('articles').delete().eq('id', id);
  query = owner === null ? query.is('rw_id', null) : query.eq('rw_id', owner);
  const { data, error } = await query.select('id').maybeSingle();
  if (error) throw error;
  rowOrNotFound(data);
  await removeFilesOrLog('article_files', id, () =>
    removeRowPhotos(ctx, { rwId: owner, purpose: 'article', entityId: id }),
  );
}
