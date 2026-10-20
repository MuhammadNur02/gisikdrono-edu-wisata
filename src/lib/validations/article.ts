import { z } from 'zod';

import { ARTICLE_INTENTS, ARTICLE_JSON_MAX_DEPTH, CMS_LIMITS } from '@/config/cms';
import { DB_ENUMS } from '@/db/enums';
import { copy } from '@/lib/copy/id';
import {
  contentTagsSchema,
  contentText,
  imagePathSchema,
  optionalContentText,
  rowIdSchema,
  slugSchema,
} from '@/lib/validations/content';

// /dashboard/articles (docs/PRD.md FR-ADMIN-11). The body is Tiptap's ProseMirror JSON, kept as it is and drawn
// through the allowlist of src/lib/rich-text/document.ts, so it is checked here for its outline and size only: a
// document whose nesting or length could make the server work hard is refused before anything walks it. The id is
// the form's own for a new article, so its photos go into its folder first (20261021080000_content_row_ids.sql);
// the RW and the status are never part of the form: the intent says which button was pressed.

const messages = copy.cms.validation;
const TAG_SEPARATOR = ',';

// Iterative, so a doctored document nested thousands deep is refused before any recursive walk could overflow.
function isNestedWithin(value: unknown, maxDepth: number): boolean {
  const pending: { node: unknown; depth: number }[] = [{ node: value, depth: 0 }];
  for (let next = pending.pop(); next; next = pending.pop()) {
    if (next.depth > maxDepth) return false;
    if (typeof next.node !== 'object' || next.node === null) continue;
    for (const child of Object.values(next.node))
      pending.push({ node: child, depth: next.depth + 1 });
  }
  return true;
}

function isWithinBodyLimits(value: unknown): boolean {
  if (!isNestedWithin(value, ARTICLE_JSON_MAX_DEPTH)) return false;
  const serialised = JSON.stringify(value);
  return new TextEncoder().encode(serialised).length <= CMS_LIMITS.articleBodyBytes;
}

function isDocument(value: unknown): boolean {
  return (
    typeof value === 'object' &&
    value !== null &&
    'type' in value &&
    value.type === 'doc' &&
    'content' in value &&
    Array.isArray(value.content)
  );
}

export const articleBodySchema = z
  .unknown()
  .refine(isWithinBodyLimits, messages.bodyTooLarge)
  .pipe(z.json())
  .refine(isDocument, messages.required);

// The tag field is one line of words separated by commas; what the form parsed once is already the list.
const tagsSchema = z
  .union([
    z.string().transform((line) =>
      line
        .split(TAG_SEPARATOR)
        .map((tag) => tag.trim())
        .filter((tag) => tag !== ''),
    ),
    z.array(z.string()),
  ])
  .pipe(contentTagsSchema);

export const saveArticleSchema = z
  .object({
    id: rowIdSchema,
    title: contentText(CMS_LIMITS.articleTitle),
    slug: slugSchema,
    excerpt: optionalContentText(CMS_LIMITS.articleExcerpt),
    category: z.enum(DB_ENUMS.article_category),
    tags: tagsSchema,
    coverPath: imagePathSchema,
    bodyJson: articleBodySchema,
    seoTitle: optionalContentText(CMS_LIMITS.seoTitle),
    seoDescription: optionalContentText(CMS_LIMITS.seoDescription),
    intent: z.enum(ARTICLE_INTENTS),
  })
  .strict();

export type SaveArticleInput = z.input<typeof saveArticleSchema>;
export type SaveArticleValues = z.output<typeof saveArticleSchema>;
