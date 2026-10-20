'use server';

import { revalidateTag } from 'next/cache';

import { copy } from '@/lib/copy/id';
import { fail, mapError, ok } from '@/lib/errors';
import { TAGS } from '@/lib/queries/tags';
import { saveArticleSchema, type SaveArticleValues } from '@/lib/validations/article';
import { rowRefSchema } from '@/lib/validations/content';
import { canWriteFor, requireNewContentOwner } from '@/server/auth/content-owner';
import { requireAal2, type StaffContext } from '@/server/auth/guards';
import {
  createArticle,
  readArticleOwner,
  removeArticle,
  updateArticle,
} from '@/server/services/article-service';
import type { ActionFailure, ActionResult } from '@/types/action-result';
import type { ArticleAdmin } from '@/types/cms';

// /dashboard/articles (Task P2.9.05, docs/PRD.md FR-ADMIN-11). An RW admin writes drafts and sends them for review;
// only the superadmin publishes, unpublishes and removes (articles_moderation_guard and articles_super_delete say
// so again in the database). A new article belongs to the RW admin's own RW, or for the superadmin to the RW the
// RwSwitcher points at (the kelurahan under Semua); an existing one to the owner the database holds.

function refusedIntent(ctx: StaffContext, values: SaveArticleValues): ActionFailure | null {
  if (values.intent !== 'publish' || ctx.role === 'superadmin') return null;
  return fail('FORBIDDEN', undefined, copy.cms.articles.publishOnlySuper);
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
    const article = await createArticle(guard.ctx, target.owner, parsed.data);
    revalidateTag(TAGS.articles);
    return ok(article);
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
    const owner = await readArticleOwner(parsed.data.id);
    if (owner === undefined) return fail('NOT_FOUND');
    if (!canWriteFor(guard.ctx, owner)) return fail('FORBIDDEN');
    const article = await updateArticle(owner, parsed.data);
    revalidateTag(TAGS.articles);
    return ok(article);
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
    return fail('FORBIDDEN', undefined, copy.cms.articles.removeOnlySuper);
  }

  try {
    const owner = await readArticleOwner(parsed.data.id);
    if (owner === undefined) return fail('NOT_FOUND');
    await removeArticle(guard.ctx, owner, parsed.data.id);
    revalidateTag(TAGS.articles);
    return ok(null);
  } catch (error) {
    return mapError(error);
  }
}
