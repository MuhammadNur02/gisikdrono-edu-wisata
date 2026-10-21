'use server';

import { revalidateTag } from 'next/cache';

import { copy } from '@/lib/copy/id';
import { fail, mapError, okUnlessFilesLeft } from '@/lib/errors';
import { TAGS } from '@/lib/queries/tags';
import { saveArticleSchema, type SaveArticleValues } from '@/lib/validations/article';
import { rowRefSchema } from '@/lib/validations/content';
import { canWriteFor, requireNewContentOwner } from '@/server/auth/content-owner';
import { requireAal2, type StaffContext } from '@/server/auth/guards';
import {
  createArticle,
  readArticleForStaff,
  removeArticle,
  updateArticle,
} from '@/server/services/article-service';
import type { ActionFailure, ActionResult } from '@/types/action-result';
import type { ArticleAdmin } from '@/types/cms';

// /dashboard/articles (Task P2.9.05, docs/PRD.md FR-ADMIN-11). An RW admin writes drafts and sends them for review;
// only the superadmin publishes, and once an article is published only the superadmin takes it off the site or moves
// its address: an RW admin's change to it goes back to review. articles_moderation_guard
// (20261021090000_article_published_guard.sql) and articles_super_delete say the same again in the database. A new
// article belongs to the RW admin's own RW, or for the superadmin to the RW the RwSwitcher points at (the kelurahan
// under Semua); an existing one to the owner the database holds.

const text = copy.cms.articles;

function refusedIntent(ctx: StaffContext, values: SaveArticleValues): ActionFailure | null {
  if (values.intent !== 'publish' || ctx.role === 'superadmin') return null;
  return fail('FORBIDDEN', undefined, text.publishOnlySuper);
}

// Finding 1 of the independent review of PR #18 (decision of 2026-10-21).
function refusedLiveChange(
  ctx: StaffContext,
  current: ArticleAdmin,
  values: SaveArticleValues,
): ActionFailure | null {
  if (ctx.role === 'superadmin' || current.status !== 'published') return null;
  if (values.slug !== current.slug) return fail('FORBIDDEN', undefined, text.slugLocked);
  if (values.intent === 'draft') return fail('FORBIDDEN', undefined, text.unpublishOnlySuper);
  return null;
}

export async function createArticleAction(input: unknown): Promise<ActionResult<ArticleAdmin>> {
  const parsed = saveArticleSchema.safeParse(input);
  if (!parsed.success) return mapError(parsed.error);
  const guard = await requireAal2();
  if (!guard.ok) return guard;
  const refused = refusedIntent(guard.ctx, parsed.data);
  if (refused) return refused;
  const target = await requireNewContentOwner(guard.ctx, { rwOnly: false });
  if (!target.ok) return target;

  try {
    const saved = await createArticle(guard.ctx, target.owner, parsed.data);
    revalidateTag(TAGS.articles);
    return okUnlessFilesLeft(saved);
  } catch (error) {
    return mapError(error);
  }
}

export async function updateArticleAction(input: unknown): Promise<ActionResult<ArticleAdmin>> {
  const parsed = saveArticleSchema.safeParse(input);
  if (!parsed.success) return mapError(parsed.error);
  const guard = await requireAal2();
  if (!guard.ok) return guard;
  const refused = refusedIntent(guard.ctx, parsed.data);
  if (refused) return refused;

  try {
    const current = await readArticleForStaff(parsed.data.id);
    if (!current) return fail('NOT_FOUND');
    if (!canWriteFor(guard.ctx, current.owner)) return fail('FORBIDDEN');
    const liveChange = refusedLiveChange(guard.ctx, current, parsed.data);
    if (liveChange) return liveChange;
    const saved = await updateArticle(guard.ctx, current.owner, parsed.data, current);
    revalidateTag(TAGS.articles);
    return okUnlessFilesLeft(saved);
  } catch (error) {
    return mapError(error);
  }
}

export async function removeArticleAction(input: unknown): Promise<ActionResult<null>> {
  const parsed = rowRefSchema.safeParse(input);
  if (!parsed.success) return mapError(parsed.error);
  const guard = await requireAal2();
  if (!guard.ok) return guard;
  if (guard.ctx.role !== 'superadmin') {
    return fail('FORBIDDEN', undefined, text.removeOnlySuper);
  }

  try {
    const current = await readArticleForStaff(parsed.data.id);
    if (!current) return fail('NOT_FOUND');
    const filesRemoved = await removeArticle(guard.ctx, current.owner, parsed.data.id);
    revalidateTag(TAGS.articles);
    return okUnlessFilesLeft({ value: null, filesRemoved });
  } catch (error) {
    return mapError(error);
  }
}
