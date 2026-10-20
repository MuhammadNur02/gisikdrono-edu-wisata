import type { JSONContent } from '@tiptap/react';

import type { SaveArticleInput } from '@/lib/validations/article';
import type { ArticleAdmin } from '@/types/cms';

const EMPTY_DOCUMENT: JSONContent = { type: 'doc', content: [] };

// A new article under the id the page made for it, which names its photos' folder (20261021080000_content_row_ids.sql).
export function blankArticle(id: string): SaveArticleInput {
  return {
    id,
    title: '',
    slug: '',
    excerpt: '',
    category: 'news',
    tags: '',
    coverPath: null,
    bodyJson: EMPTY_DOCUMENT,
    seoTitle: '',
    seoDescription: '',
    intent: 'draft',
  };
}

// Exactly the form's fields: the owner and the status stay out; the button pressed sets the intent.
export function articleValues(article: ArticleAdmin): SaveArticleInput {
  return {
    id: article.id,
    title: article.title,
    slug: article.slug,
    excerpt: article.excerpt ?? '',
    category: article.category,
    tags: article.tags.join(', '),
    coverPath: article.coverPath,
    bodyJson: article.bodyJson,
    seoTitle: article.seoTitle ?? '',
    seoDescription: article.seoDescription ?? '',
    intent: 'draft',
  };
}

// The editor takes Tiptap's own document shape; anything else in the field starts it empty.
export function toEditorDocument(value: unknown): JSONContent {
  return isEditorDocument(value) ? value : EMPTY_DOCUMENT;
}

function isEditorDocument(value: unknown): value is JSONContent {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
